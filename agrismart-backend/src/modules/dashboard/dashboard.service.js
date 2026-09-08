'use strict';

/**
 * modules/dashboard/dashboard.service.js
 *
 * MVP/demo pass (see project notes: "presentable MVP first, security
 * hardening after"). This module writes NOTHING — it only composes
 * reads that already exist across devices/telemetry/irrigation/commands
 * into shapes the frontend dashboard needs, so those modules don't grow
 * dashboard-specific responsibilities of their own.
 *
 * The "alerts" here are deliberately NOT a persisted notifications/
 * audit-log system (explicitly out of scope for this MVP pass) — they
 * are computed fresh on every read from data that already exists
 * (device lastSeenAt, latest telemetry readings, recent command
 * failures). This is an honest, documented simplification: nothing is
 * stored, nothing is "acknowledged" or deduplicated across requests,
 * and building a real alerting/notification system is explicit future
 * work.
 */

const devicesRepository = require('../devices/devices.repository');
const devicesService = require('../devices/devices.service');
const telemetryRepository = require('../telemetry/telemetry.repository');
const irrigationRepository = require('../irrigation/irrigation.repository');
const commandsRepository = require('../commands/commands.repository');
const AlertAcknowledgement = require('./alertAcknowledgement.model');
const config = require('../../config');
const { DEVICE_STATUS } = require('../devices/device.model');
const { COMMAND_STATUS } = require('../commands/deviceCommand.model');

// MVP alert thresholds. Deliberately simple constants, not a
// configurable rules engine — promote to config/ or a real rules
// engine only if the post-MVP phase actually needs it.
const ALERT_THRESHOLDS = Object.freeze({
  SOIL_MOISTURE_LOW_PERCENT: 30,
  SOIL_MOISTURE_HIGH_PERCENT: 85,
  SOIL_TEMPERATURE_HIGH_CELSIUS: 35,
});

const RANGE_TO_MS = Object.freeze({
  live: 60 * 60 * 1000, // last 1h, used for the "Live" telemetry tab
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
});

function serializeDevice(device) {
  return {
    deviceId: device.deviceId,
    name: device.name || device.deviceId,
    farmId: String(device.farmId),
    status: device.status,
    online: devicesService.isOnline(device),
    firmwareVersion: device.firmwareVersion || null,
    lastSeenAt: device.lastSeenAt,
    batteryPercent: device.lastBatteryPercent ?? null,
    signalStrengthDbm: device.lastSignalStrengthDbm ?? null,
    createdAt: device.createdAt,
  };
}

function serializeValve(valve, todayUsageSeconds) {
  return {
    valveId: String(valve._id),
    deviceId: valve.deviceId,
    farmId: String(valve.farmId),
    name: valve.name || 'Valve',
    commandedState: valve.commandedState,
    confirmedState: valve.confirmedState,
    confirmedStateAt: valve.confirmedStateAt || null,
    lastOpenedAt: valve.lastOpenedAt || null,
    lastClosedAt: valve.lastClosedAt || null,
    todayUsageSeconds: todayUsageSeconds ?? 0,
    dailyAllowanceSeconds: config.irrigation.dailyAllowanceSeconds,
    maxDurationSeconds: config.irrigation.maxDurationSeconds,
    automationEnabled: valve.automationEnabled,
    autoOpenBelowPercent: valve.autoOpenBelowPercent,
    autoCloseAbovePercent: valve.autoCloseAbovePercent,
    autoDurationSeconds: valve.autoDurationSeconds,
  };
}

function serializeTelemetry(reading) {
  if (!reading) return null;
  return {
    deviceId: reading.deviceId,
    recordedAt: reading.recordedAt,
    soilMoisturePercent: reading.readings?.soilMoisturePercent ?? null,
    temperatureCelsius: reading.readings?.temperatureCelsius ?? null,
    soilSalinityPpt: reading.readings?.soilSalinityPpt ?? null,
  };
}

function serializeCommand(command) {
  return {
    commandId: String(command._id),
    deviceId: command.deviceId,
    farmId: String(command.farmId),
    type: command.type,
    status: command.status,
    createdAt: command.createdAt,
    updatedAt: command.updatedAt,
    expiresAt: command.expiresAt,
  };
}

async function getDevicesForFarm(farmId) {
  const devices = await devicesRepository.listByFarmId(farmId);
  return devices.map(serializeDevice);
}

async function getValvesForFarm(farmId) {
  const valves = await irrigationRepository.listValvesByFarmId(farmId);
  return Promise.all(
    valves.map(async (valve) => {
      const todayUsageSeconds = await irrigationRepository.getTodayUsageSeconds(valve._id);
      return serializeValve(valve, todayUsageSeconds);
    })
  );
}

async function getLatestTelemetryForDevices(deviceIds) {
  const entries = await Promise.all(
    deviceIds.map(async (deviceId) => {
      const [latest] = await telemetryRepository.findRecentForDevice(deviceId, { limit: 1 });
      return [deviceId, serializeTelemetry(latest)];
    })
  );
  return Object.fromEntries(entries);
}

async function getTelemetryHistoryForDevice(deviceId, range) {
  const windowMs = RANGE_TO_MS[range] ?? RANGE_TO_MS['24h'];
  const since = new Date(Date.now() - windowMs);
  const readings = await telemetryRepository.findSinceForDevice(deviceId, since, { limit: 2000 });
  return readings.map(serializeTelemetry);
}

async function getCommandsForFarm(farmId, { limit = 20 } = {}) {
  const commands = await commandsRepository.findRecentForFarm(farmId, { limit });
  return commands.map(serializeCommand);
}

async function getCommandsForDevice(deviceId, { limit = 20 } = {}) {
  const commands = await commandsRepository.findRecentForDevice(deviceId, { limit });
  return commands.map(serializeCommand);
}

/**
 * Derives alerts fresh on every call — see module header. Looks at:
 * device offline, out-of-range latest readings, and recently failed
 * commands. Sorted newest-first, capped at 50.
 */
async function getAlertsForFarm(farmId) {
  const devices = await devicesRepository.listByFarmId(farmId);
  const alerts = [];

  for (const device of devices) {
    const online = devicesService.isOnline(device);
    if (!online && device.status !== DEVICE_STATUS.PROVISIONED) {
      alerts.push({
        id: `offline:${device.deviceId}`,
        severity: 'warning',
        title: 'Device offline',
        message: `${device.name || device.deviceId} has not reported in recently.`,
        deviceId: device.deviceId,
        at: device.lastSeenAt || device.createdAt,
      });
    }

    const [latest] = await telemetryRepository.findRecentForDevice(device.deviceId, { limit: 1 });
    if (latest?.readings) {
      const { soilMoisturePercent, temperatureCelsius } = latest.readings;

      if (typeof soilMoisturePercent === 'number' && soilMoisturePercent < ALERT_THRESHOLDS.SOIL_MOISTURE_LOW_PERCENT) {
        alerts.push({
          id: `moisture-low:${device.deviceId}:${latest._id}`,
          severity: 'critical',
          title: 'Low soil moisture',
          message: `${device.name || device.deviceId}: soil moisture is ${soilMoisturePercent}% (below ${ALERT_THRESHOLDS.SOIL_MOISTURE_LOW_PERCENT}%).`,
          deviceId: device.deviceId,
          at: latest.recordedAt,
        });
      }

      if (typeof soilMoisturePercent === 'number' && soilMoisturePercent > ALERT_THRESHOLDS.SOIL_MOISTURE_HIGH_PERCENT) {
        alerts.push({
          id: `moisture-high:${device.deviceId}:${latest._id}`,
          severity: 'notice',
          title: 'High soil moisture',
          message: `${device.name || device.deviceId}: soil moisture is ${soilMoisturePercent}% (above ${ALERT_THRESHOLDS.SOIL_MOISTURE_HIGH_PERCENT}%).`,
          deviceId: device.deviceId,
          at: latest.recordedAt,
        });
      }

      if (typeof temperatureCelsius === 'number' && temperatureCelsius > ALERT_THRESHOLDS.SOIL_TEMPERATURE_HIGH_CELSIUS) {
        alerts.push({
          id: `temp-high:${device.deviceId}:${latest._id}`,
          severity: 'warning',
          title: 'High soil temperature',
          message: `${device.name || device.deviceId}: temperature is ${temperatureCelsius}°C (above ${ALERT_THRESHOLDS.SOIL_TEMPERATURE_HIGH_CELSIUS}°C).`,
          deviceId: device.deviceId,
          at: latest.recordedAt,
        });
      }
    }
  }

  const recentCommands = await commandsRepository.findRecentForFarm(farmId, { limit: 20 });
  for (const command of recentCommands) {
    if (command.status === COMMAND_STATUS.FAILED) {
      alerts.push({
        id: `command-failed:${command._id}`,
        severity: 'critical',
        title: 'Command failed',
        message: `${command.type} failed on device ${command.deviceId}.`,
        deviceId: command.deviceId,
        at: command.updatedAt,
      });
    }
  }

  alerts.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const capped = alerts.slice(0, 50);

  // Merge in durable acknowledgement state (see
  // alertAcknowledgement.model.js) — the alert CONTENT above is always
  // recomputed fresh; only whether a human has already dismissed this
  // specific occurrence is persisted.
  if (capped.length === 0) return capped;
  const acks = await AlertAcknowledgement.find({
    farmId,
    alertId: { $in: capped.map((a) => a.id) },
  }).select('alertId');
  const ackedIds = new Set(acks.map((a) => a.alertId));
  return capped.map((a) => ({ ...a, acknowledged: ackedIds.has(a.id) }));
}

/**
 * Marks one computed alert as resolved/read. Idempotent (re-acking an
 * already-acked alert is a harmless no-op via the unique index).
 */
async function acknowledgeAlert(farmId, alertId, userId) {
  try {
    await AlertAcknowledgement.create({ farmId, alertId, acknowledgedByUserId: userId });
  } catch (err) {
    if (err.code !== 11000) throw err; // already acknowledged — fine
  }
}

async function unacknowledgeAlert(farmId, alertId) {
  await AlertAcknowledgement.deleteOne({ farmId, alertId });
}

/**
 * One composed call for the main Dashboard view — devices, valves,
 * latest telemetry per device, and alerts, in a single round trip
 * (deliberately, for a smooth demo — avoids the frontend firing five
 * separate requests just to paint the first screen).
 */
async function getFarmSummary(farmId) {
  const [devices, valves, alerts] = await Promise.all([
    getDevicesForFarm(farmId),
    getValvesForFarm(farmId),
    getAlertsForFarm(farmId),
  ]);

  const latestTelemetryByDevice = await getLatestTelemetryForDevices(devices.map((d) => d.deviceId));

  const deviceCounts = devices.reduce(
    (acc, d) => {
      acc.total += 1;
      if (d.status === DEVICE_STATUS.SUSPENDED) acc.maintenance += 1;
      else if (d.online) acc.online += 1;
      else acc.offline += 1;
      return acc;
    },
    { total: 0, online: 0, offline: 0, maintenance: 0 }
  );

  return { devices, valves, alerts, latestTelemetryByDevice, deviceCounts };
}

async function getDeviceDetail(device) {
  const [latest] = await telemetryRepository.findRecentForDevice(device.deviceId, { limit: 1 });
  return {
    device: serializeDevice(device),
    latestTelemetry: serializeTelemetry(latest),
  };
}

module.exports = {
  getFarmSummary,
  getDevicesForFarm,
  getValvesForFarm,
  getLatestTelemetryForDevices,
  getTelemetryHistoryForDevice,
  getCommandsForFarm,
  getCommandsForDevice,
  getAlertsForFarm,
  acknowledgeAlert,
  unacknowledgeAlert,
  getDeviceDetail,
};
