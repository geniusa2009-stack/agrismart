'use strict';

/**
 * modules/telemetry/telemetryIdempotency.model.js
 *
 * Companion REGULAR collection providing the database-level idempotency
 * backstop that Telemetry (a Time Series collection) cannot provide
 * itself, since MongoDB does not support unique indexes on Time Series
 * collections. A unique compound index on (deviceId, messageId) here is
 * the source of truth for "have we already recorded this exact
 * reading" — see telemetry.service.js.
 *
 * Short TTL: this collection only needs to catch duplicates that arrive
 * within a realistic device retry/reconnect window, not forever, so it
 * doesn't grow unbounded at the same rate as raw telemetry.
 */

const mongoose = require('mongoose');

const telemetryIdempotencySchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  messageId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

telemetryIdempotencySchema.index({ deviceId: 1, messageId: 1 }, { unique: true });
// 7-day window is a reasonable starting point for catching delayed
// device retries after an extended offline period; tune once real
// device reconnect behavior is observed.
telemetryIdempotencySchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('TelemetryIdempotencyKey', telemetryIdempotencySchema);
