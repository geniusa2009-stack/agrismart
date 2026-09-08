'use strict';

/**
 * modules/irrigation/irrigation.service.js
 *
 * Irrigation safety rules, enforced server-side (Stage 2 section 10 /
 * Stage 3 requirement — "the system must prioritize physical safety and
 * water-system integrity over convenience"). This is the one module
 * where a bug has a physical-world consequence (flooding, wasted
 * water, a burst line from an unattended open valve), so every rule
 * below is deliberately conservative.
 */

const irrigationRepository = require('./irrigation.repository');
const farmsRepository = require('../farms/farms.repository');
const devicesRepository = require('../devices/devices.repository');
const devicesService = require('../devices/devices.service');
const commandsService = require('../commands/commands.service');
const { COMMAND_TYPE } = require('../commands/deviceCommand.model');
const { VALVE_STATE } = require('./valve.model');
const config = require('../../config');
const metrics = require('../../observability/metrics');
const logger = require('../../observability/logger');
const { ApiError, ErrorCodes } = require('../../middleware/errorHandler');

async function createValve({ farmId, deviceId, name }) {
  return irrigationRepository.createValve({ farmId, deviceId, name });
}

/**
 * Opens a valve, subject to every server-side safety rule. Never trusts
 * the caller's requested duration alone — always clamps to the
 * configured maximum, and always checks the daily allowance BEFORE
 * issuing the command.
 */
async function openValve({ valve, requestedDurationSeconds, userId, triggeredBy = 'manual', idempotencyKey }) {
  // 1. Device offline protection: a valve whose owning device hasn't
  // been heard from recently must never be assumed controllable — we
  // still allow a manual open attempt (the device might catch up when
  // it reconnects) but the caller is told explicitly this can't be
  // confirmed, and the valve's confirmedState is never assumed to
  // change as a result of merely issuing the command.
  const device = await devicesRepository.findByDeviceId(valve.deviceId);
  const deviceOnline = device ? devicesService.isOnline(device) : false;

  // 2. Maximum irrigation duration — server-side clamp, never trust the
  // caller's requested value alone. Firmware is expected to enforce its
  // own independent auto-close timer as defense-in-depth (documented
  // contract, outside this backend's code).
  const durationSeconds = Math.min(
    requestedDurationSeconds,
    config.irrigation.maxDurationSeconds
  );

  // 3. Maximum daily water allowance.
  const usedToday = await irrigationRepository.getTodayUsageSeconds(valve._id);
  if (usedToday + durationSeconds > config.irrigation.dailyAllowanceSeconds) {
    throw new ApiError(
      409,
      `Daily irrigation allowance exceeded for this valve (${usedToday}s used, ${config.irrigation.dailyAllowanceSeconds}s allowed).`,
      { code: ErrorCodes.IRRIGATION_SAFETY_VIOLATION }
    );
  }

  // 4. Duplicate command protection: an idempotencyKey (client-supplied
  // or derived) means a retried API call (e.g. a double-tap in the
  // mobile app) issues the SAME command, not a second one.
  logger.info(
    { scope: 'irrigation', valveId: String(valve._id), deviceId: valve.deviceId, triggeredBy, durationSeconds },
    `Irrigation decision: opening valve (${triggeredBy}).`
  );

  const command = await commandsService.issueCommand({
    deviceId: valve.deviceId,
    farmId: valve.farmId,
    issuedByUserId: userId,
    type: COMMAND_TYPE.OPEN_VALVE,
    payload: { maxDurationSeconds: durationSeconds },
    idempotencyKey,
  });

  await irrigationRepository.updateCommandedState(valve._id, VALVE_STATE.OPEN);

  const irrigationEvent = await irrigationRepository.createIrrigationEvent({
    valveId: valve._id,
    farmId: valve.farmId,
    openCommandId: command._id,
    startedAt: new Date(),
    plannedDurationSeconds: durationSeconds,
    triggeredBy,
  });

  metrics.increment('irrigation_events_total');

  if (!deviceOnline) {
    logger.warn(
      { scope: 'irrigation', valveId: String(valve._id), deviceId: valve.deviceId },
      'OPEN_VALVE issued to an offline device — execution cannot be confirmed; valve confirmedState remains unknown.'
    );
  }

  return { command, irrigationEvent, durationSeconds, deviceOnline };
}

/**
 * Closes a valve. Always allowed — manual override takes priority over
 * any automated/queued state, per Stage 2 section 10.
 */
async function closeValve({ valve, userId, idempotencyKey }) {
  logger.info(
    { scope: 'irrigation', valveId: String(valve._id), deviceId: valve.deviceId },
    'Irrigation decision: closing valve.'
  );

  const command = await commandsService.issueCommand({
    deviceId: valve.deviceId,
    farmId: valve.farmId,
    issuedByUserId: userId,
    type: COMMAND_TYPE.CLOSE_VALVE,
    payload: {},
    idempotencyKey,
  });

  await irrigationRepository.updateCommandedState(valve._id, VALVE_STATE.CLOSED);

  const openEvent = await irrigationRepository.findOpenIrrigationEvent(valve._id);
  if (openEvent) {
    const endedAt = new Date();
    const actualDurationSeconds = Math.round((endedAt.getTime() - openEvent.startedAt.getTime()) / 1000);
    await irrigationRepository.closeIrrigationEvent(openEvent._id, {
      endedAt,
      actualDurationSeconds,
      closeCommandId: command._id,
    });
  }

  return { command };
}

/**
 * Emergency stop: highest priority, always allowed regardless of daily
 * allowance or normal command throttling (the route deliberately does
 * NOT apply commandLimiter — see irrigation.routes.js). Closes every
 * valve on the farm.
 */
async function emergencyStopFarm({ farmId, valves, userId }) {
  const results = [];
  for (const valve of valves) {
    const command = await commandsService.issueCommand({
      deviceId: valve.deviceId,
      farmId,
      issuedByUserId: userId,
      type: COMMAND_TYPE.EMERGENCY_STOP,
      payload: { reason: 'emergency_stop' },
    });
    await irrigationRepository.updateCommandedState(valve._id, VALVE_STATE.CLOSED);
    results.push({ valveId: valve._id, commandId: command._id });
  }
  logger.warn({ scope: 'irrigation', farmId: String(farmId), valveCount: valves.length, userId }, 'Emergency stop issued.');
  return results;
}

/**
 * Called when the device reports back what actually happened to a
 * valve command (via commands.service.reportExecutionResult upstream).
 * This is the ONLY path that updates confirmedState — never the act of
 * issuing a command (Stage 2 section 10: valve state verification).
 */
/**
 * Updates a valve's automation settings. `valve` is the already
 * ownership-checked document attached by irrigation.controller.js's
 * loadValve middleware — never re-derives access.
 */
async function updateAutomationSettings(valve, settings) {
  return irrigationRepository.updateAutomationSettings(valve._id, settings);
}

/**
 * Called by telemetry.service.ingest() after every stored reading
 * (MVP "Automation Settings" feature). Looks up whether this device
 * has a valve wired to it and, if that valve has automationEnabled,
 * applies the same simple threshold-crossing rule the demo simulator
 * uses to real telemetry: open once moisture drops below
 * autoOpenBelowPercent (if not already open), close once it recovers
 * above autoCloseAbovePercent (if currently open). A no-op for devices
 * with no valve, or a valve with automation disabled — real device
 * telemetry ingestion is completely unaffected unless the farmer has
 * explicitly turned automation on for that valve.
 */
async function evaluateAutomation(deviceId, readings) {
  const { soilMoisturePercent } = readings || {};
  if (typeof soilMoisturePercent !== 'number') return null;

  const valve = await irrigationRepository.findValveByDeviceId(deviceId);
  if (!valve || !valve.automationEnabled) return null;

  // Automated commands still need a real, accountable issuedByUserId
  // (DeviceCommand.issuedByUserId is required — Stage 2 section 9:
  // every command must be attributable). Automation only runs because
  // the farm owner explicitly enabled it on this valve, so commands it
  // issues are attributed to that owner, never to a fake/null system
  // user.
  const farm = await farmsRepository.findByIdPlain(valve.farmId);
  if (!farm) return null;

  if (valve.commandedState !== VALVE_STATE.OPEN && soilMoisturePercent < valve.autoOpenBelowPercent) {
    logger.info(
      { scope: 'irrigation', valveId: String(valve._id), deviceId, soilMoisturePercent, threshold: valve.autoOpenBelowPercent },
      'Automation: soil moisture below threshold, opening valve.'
    );
    return openValve({
      valve,
      requestedDurationSeconds: valve.autoDurationSeconds,
      userId: farm.ownerId,
      triggeredBy: 'automated',
    });
  }

  if (valve.commandedState === VALVE_STATE.OPEN && soilMoisturePercent > valve.autoCloseAbovePercent) {
    logger.info(
      { scope: 'irrigation', valveId: String(valve._id), deviceId, soilMoisturePercent, threshold: valve.autoCloseAbovePercent },
      'Automation: soil moisture recovered above threshold, closing valve.'
    );
    return closeValve({ valve, userId: farm.ownerId });
  }

  return null;
}

async function confirmValveState(valveId, state) {
  logger.info({ scope: 'irrigation', valveId: String(valveId), state }, `Valve state changed: ${state}.`);
  return irrigationRepository.updateConfirmedState(valveId, state);
}

module.exports = {
  createValve,
  openValve,
  closeValve,
  emergencyStopFarm,
  confirmValveState,
  updateAutomationSettings,
  evaluateAutomation,
};
