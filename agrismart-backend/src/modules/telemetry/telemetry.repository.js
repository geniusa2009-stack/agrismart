'use strict';

const Telemetry = require('./telemetry.model');
const TelemetryIdempotencyKey = require('./telemetryIdempotency.model');

/**
 * Attempts to claim a (deviceId, messageId) pair. Returns true if this
 * is the first time it's been seen (safe to insert into Telemetry);
 * false if it's a duplicate (the unique index rejected it) — the
 * database-level backstop for idempotency (Stage 2 section 9).
 */
async function claimIdempotencyKey(deviceId, messageId) {
  try {
    await TelemetryIdempotencyKey.create({ deviceId, messageId });
    return true;
  } catch (err) {
    if (err.code === 11000) return false; // duplicate key = already claimed
    throw err;
  }
}

async function insertReading(document) {
  return Telemetry.create(document);
}

async function findRecentForDevice(deviceId, { limit = 100 } = {}) {
  return Telemetry.find({ deviceId }).sort({ recordedAt: -1 }).limit(limit);
}

/**
 * MVP dashboard read: chronological (oldest-first, chart-ready)
 * telemetry for a device within a time window — powers the "last N
 * hours/days" telemetry charts. `since` is a Date; `limit` guards
 * against an unbounded scan on a wide-open range.
 */
async function findSinceForDevice(deviceId, since, { limit = 1000 } = {}) {
  return Telemetry.find({ deviceId, recordedAt: { $gte: since } })
    .sort({ recordedAt: 1 })
    .limit(limit);
}

module.exports = { claimIdempotencyKey, insertReading, findRecentForDevice, findSinceForDevice };
