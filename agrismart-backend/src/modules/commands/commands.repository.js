'use strict';

const DeviceCommand = require('./deviceCommand.model');

async function create(doc) {
  try {
    return await DeviceCommand.create(doc);
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate idempotencyKey — the caller already issued this exact
      // command (Stage 2 section 10: duplicate command protection).
      return DeviceCommand.findOne({ idempotencyKey: doc.idempotencyKey });
    }
    throw err;
  }
}

async function findById(id) {
  return DeviceCommand.findById(id);
}

async function updateStatus(id, status, note) {
  return DeviceCommand.findByIdAndUpdate(
    id,
    {
      status,
      $push: { statusHistory: { status, at: new Date(), note } },
    },
    { new: true }
  );
}

async function setExecutionResult(id, { status, executionResult }) {
  return DeviceCommand.findByIdAndUpdate(
    id,
    {
      status,
      executionResult,
      $push: { statusHistory: { status, at: new Date() } },
    },
    { new: true }
  );
}

/**
 * Finds every command still in a non-terminal state whose expiresAt has
 * passed — used by the timeout sweep (Stage 2 section 9/13).
 */
async function findExpiredPending() {
  const nonTerminal = ['pending', 'queued', 'sent', 'acknowledged', 'executing'];
  return DeviceCommand.find({ status: { $in: nonTerminal }, expiresAt: { $lt: new Date() } });
}

/**
 * MVP dashboard reads: recent command history, per device or per farm.
 * Read-only, most recent first — powers the "Active Commands"/command
 * history views. Ownership is already verified by the caller
 * (authorizeFarmOwnership / authorizeDeviceFarmAccess) before either of
 * these is invoked.
 */
async function findRecentForDevice(deviceId, { limit = 20 } = {}) {
  return DeviceCommand.find({ deviceId }).sort({ createdAt: -1 }).limit(limit);
}

async function findRecentForFarm(farmId, { limit = 20 } = {}) {
  return DeviceCommand.find({ farmId }).sort({ createdAt: -1 }).limit(limit);
}

module.exports = {
  create,
  findById,
  updateStatus,
  setExecutionResult,
  findExpiredPending,
  findRecentForDevice,
  findRecentForFarm,
};
