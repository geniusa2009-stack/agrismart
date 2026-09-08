'use strict';

const Device = require('./device.model');
const { isAtLeast, ROLES } = require('../../security/rbac');

async function create({ deviceId, farmId, name, deviceSecretHash }) {
  return Device.create({ deviceId, farmId, name, deviceSecretHash });
}

/**
 * The ONLY query that projects in the secret hash — used exclusively
 * by authenticateDevice() during credential verification.
 */
async function findByDeviceIdWithSecret(deviceId) {
  return Device.findOne({ deviceId }).select('+deviceSecretHash');
}

async function findByDeviceId(deviceId) {
  return Device.findOne({ deviceId });
}

async function findByDeviceIdForPrincipal(deviceId, principal) {
  const device = await Device.findOne({ deviceId }).populate('farmId');
  if (!device) return null;
  if (isAtLeast(principal.role, ROLES.ADMIN)) return device;
  if (String(device.farmId.ownerId) === String(principal.id)) return device;
  return null;
}

/**
 * MVP dashboard read (Stage: MVP/demo pass). Farm ownership is already
 * verified by the caller (authorizeFarmOwnership attaches req.farm)
 * before this is ever called — this function trusts a farmId that has
 * already been through that check, the same convention
 * irrigation.repository.js/commands.repository.js follow for their
 * farm-scoped reads.
 */
async function listByFarmId(farmId) {
  return Device.find({ farmId }).sort({ createdAt: 1 });
}

async function updateName(deviceId, name) {
  return Device.findOneAndUpdate({ deviceId }, { name }, { new: true });
}

async function updateSecretHash(deviceId, deviceSecretHash) {
  return Device.findOneAndUpdate({ deviceId }, { deviceSecretHash }, { new: true });
}

async function updateStatus(deviceId, status) {
  return Device.findOneAndUpdate({ deviceId }, { status }, { new: true });
}

async function recordHeartbeat(deviceId, { batteryPercent, signalStrengthDbm } = {}) {
  const update = { lastSeenAt: new Date() };
  if (batteryPercent !== undefined) update.lastBatteryPercent = batteryPercent;
  if (signalStrengthDbm !== undefined) update.lastSignalStrengthDbm = signalStrengthDbm;
  return Device.findOneAndUpdate({ deviceId }, update, { new: true });
}

module.exports = {
  create,
  findByDeviceIdWithSecret,
  findByDeviceId,
  findByDeviceIdForPrincipal,
  listByFarmId,
  updateName,
  updateSecretHash,
  updateStatus,
  recordHeartbeat,
};
