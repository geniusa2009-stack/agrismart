'use strict';

/**
 * modules/telemetry/telemetry.model.js
 *
 * MongoDB Time Series Collection for raw sensor telemetry (Stage 2
 * section 10 decision, justified there: high-frequency, append-only,
 * time-stamped, high-cardinality-by-device — the canonical Time Series
 * use case). `timeField` is `recordedAt` (server-authoritative receipt
 * time — see telemetry.service.js for why device-reported time is
 * stored separately and never used as the primary time field).
 * `metaField` is `deviceId`.
 *
 * IMPORTANT, documented honestly (Stage 3 completion report repeats
 * this): MongoDB does NOT support unique indexes on Time Series
 * collections, so the (deviceId, messageId) idempotency guarantee
 * required by Stage 2 section 9 CANNOT live as a unique index on this
 * collection. It lives instead on a small companion regular collection,
 * `telemetryIdempotency.model.js` — see telemetry.service.js for how
 * the two are used together.
 *
 * Retention: `expireAfterSeconds` is left unset here deliberately — the
 * Stage 2 plan flagged retention duration as a business decision that
 * needs your input, not something to invent. Set
 * TELEMETRY_RETENTION_SECONDS and wire it into ensureIndexes.js once
 * that decision is made; until then raw telemetry is retained
 * indefinitely, which is the safe default (losing data is worse than
 * temporarily over-retaining it).
 */

const mongoose = require('mongoose');

const telemetrySchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true },
    messageId: { type: String, required: true },
    sequenceNumber: { type: Number },
    recordedAt: { type: Date, required: true }, // server receipt time — authoritative
    deviceReportedAt: { type: Date }, // device's own clock — reference only, never trusted alone
    readings: {
      soilMoisturePercent: { type: Number, min: 0, max: 100 },
      soilSalinityPpt: { type: Number, min: 0 },
      temperatureCelsius: { type: Number, min: -40, max: 85 },
    },
  },
  {
    timeseries: {
      timeField: 'recordedAt',
      metaField: 'deviceId',
      granularity: 'seconds',
    },
  }
);

module.exports = mongoose.model('Telemetry', telemetrySchema);
