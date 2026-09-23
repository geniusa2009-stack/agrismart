'use strict';

const Valve = require('./valve.model');
const IrrigationEvent = require('./irrigationEvent.model');

async function createValve({ deviceId, farmId, name }) {
  return Valve.create({ deviceId, farmId, name });
}

async function findValveByIdForPrincipal(valveId, principal) {
  const { isAtLeast, ROLES } = require('../../security/rbac');
  const valve = await Valve.findById(valveId).populate('farmId');
  if (!valve) return null;
  if (isAtLeast(principal.role, ROLES.ADMIN)) return valve;
  if (String(valve.farmId.ownerId) === String(principal.id)) return valve;
  return null;
}

/**
 * MVP dashboard read: list every valve on a farm. Farm ownership is
 * already verified by the caller (authorizeFarmOwnership) before this
 * is invoked, same convention as devices.repository.listByFarmId.
 */
async function listValvesByFarmId(farmId) {
  return Valve.find({ farmId }).sort({ createdAt: 1 });
}

/**
 * Used by irrigation.service.evaluateAutomation() — finds the (single,
 * MVP assumption) valve wired to a given device, so a telemetry reading
 * from that device can be checked against ITS valve's automation
 * settings. Returns null if the device has no valve (most devices are
 * pure sensors, not irrigation controllers).
 */
async function findValveByDeviceId(deviceId) {
  return Valve.findOne({ deviceId });
}

async function updateAutomationSettings(valveId, settings) {
  return Valve.findByIdAndUpdate(valveId, settings, { new: true });
}

async function updateCommandedState(valveId, state) {
  const update = { commandedState: state };
  if (state === 'open') update.lastOpenedAt = new Date();
  if (state === 'closed') update.lastClosedAt = new Date();
  return Valve.findByIdAndUpdate(valveId, update, { new: true });
}

async function updateConfirmedState(valveId, state) {
  return Valve.findByIdAndUpdate(
    valveId,
    { confirmedState: state, confirmedStateAt: new Date() },
    { new: true }
  );
}

async function createIrrigationEvent(doc) {
  return IrrigationEvent.create(doc);
}

async function findOpenIrrigationEvent(valveId) {
  return IrrigationEvent.findOne({ valveId, endedAt: null }).sort({ startedAt: -1 });
}

async function closeIrrigationEvent(eventId, { endedAt, actualDurationSeconds, closeCommandId }) {
  return IrrigationEvent.findByIdAndUpdate(
    eventId,
    { endedAt, actualDurationSeconds, closeCommandId },
    { new: true }
  );
}

/**
 * AgriSmart-native data collection contract: records a device-reported
 * applied water volume against the irrigation event whose CLOSE_VALVE
 * command this is (matched by closeCommandId, set synchronously in
 * irrigation.service.closeValve() before the device ever confirms
 * anything — see that function). Returns null (no-op) if no event
 * matches this commandId, e.g. the command was never a close command.
 */
async function setAppliedWaterVolumeForCloseCommand(commandId, appliedWaterVolumeLiters) {
  return IrrigationEvent.findOneAndUpdate(
    { closeCommandId: commandId },
    { appliedWaterVolumeLiters },
    { new: true }
  );
}

async function updateValveZone(valveId, zoneId) {
  return Valve.findByIdAndUpdate(valveId, { zoneId }, { new: true });
}

/**
 * Used by zones.service.deleteZone()'s conservative delete-guard (same
 * "refuse to delete a referenced parent" philosophy as
 * farms.service.deleteFarm).
 */
async function countValvesByZoneId(zoneId) {
  return Valve.countDocuments({ zoneId });
}

/**
 * Recent irrigation events for a valve — powers the dashboard's
 * "irrigation history" chart/list. Read-only, most recent first.
 */
async function findRecentEventsForValve(valveId, { limit = 20 } = {}) {
  return IrrigationEvent.find({ valveId }).sort({ startedAt: -1 }).limit(limit);
}

async function findRecentEventsForFarm(farmId, { limit = 20 } = {}) {
  return IrrigationEvent.find({ farmId }).sort({ startedAt: -1 }).limit(limit);
}

/**
 * Sums planned duration for every irrigation event started today for
 * this valve — the daily water allowance check (Stage 2 section 10).
 */
async function getTodayUsageSeconds(valveId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const result = await IrrigationEvent.aggregate([
    { $match: { valveId, startedAt: { $gte: startOfDay } } },
    {
      $group: {
        _id: null,
        totalSeconds: {
          $sum: { $ifNull: ['$actualDurationSeconds', '$plannedDurationSeconds'] },
        },
      },
    },
  ]);

  return result.length > 0 ? result[0].totalSeconds : 0;
}

module.exports = {
  createValve,
  findValveByIdForPrincipal,
  listValvesByFarmId,
  findValveByDeviceId,
  updateAutomationSettings,
  updateCommandedState,
  updateConfirmedState,
  createIrrigationEvent,
  findOpenIrrigationEvent,
  closeIrrigationEvent,
  setAppliedWaterVolumeForCloseCommand,
  updateValveZone,
  countValvesByZoneId,
  findRecentEventsForValve,
  findRecentEventsForFarm,
  getTodayUsageSeconds,
};
