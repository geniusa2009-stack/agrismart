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
 *
 * AgriSmart-native data collection contract (finalized — see
 * ai/external/AGRISMART_DATA_COLLECTION_CONTRACT.md and
 * GAP_ANALYSIS.md for the full rationale and its relationship to the
 * three current AI targets):
 *
 *   - `farmId` / `zoneId` are SERVER-DERIVED from the authenticated
 *     device's own Device document (never accepted from the ingest
 *     payload — see telemetry.service.js) and denormalized here for
 *     query convenience, the same pattern Valve/DeviceCommand/
 *     IrrigationEvent already use for `farmId`.
 *   - `readings.temperatureCelsius` (pre-existing field, unchanged) IS
 *     soil temperature: it comes from the same in-soil probe bundle as
 *     `soilMoisturePercent`/`soilSalinityPpt` (confirmed for the
 *     Evolving Tomato Testbed's Milesight EM500-SMTC soil sensor during
 *     the AI fix-rerun documented in FIX_RERUN_REPORT.md section 2).
 *     It is documented here, not renamed, to avoid breaking the
 *     existing AI feature-engineering read sites
 *     (ai/features/featureEngineering.js, ai/features/featureVersion.js,
 *     ai/data/telemetryLoader.js) and their tests.
 *   - `readings.soilSalinityPpt` (pre-existing field, unchanged) unit is
 *     parts-per-thousand (ppt), as its name already states. No
 *     EC-to-salinity conversion is implemented anywhere in this
 *     backend — GAP_ANALYSIS.md section 1b documents why none is
 *     applied without a documented, sensor-specific formula.
 *   - `readings.soilEcMicrosiemensPerCm` is NEW: the RAW electrical
 *     conductivity reading, in explicit units, kept separate from the
 *     already-converted `soilSalinityPpt` — this is exactly the
 *     `soil_ec` vs. `salinity` distinction
 *     AGRISMART_DATA_COLLECTION_CONTRACT.md's field list already draws.
 *   - `readings.airTemperatureCelsius` / `relativeHumidityPercent` /
 *     `precipitationMm` are NEW, optional weather-context readings
 *     (contract: "air_temperature (if available), humidity (if
 *     available), rainfall (if available)") — most devices are pure
 *     soil sensors and will never report these; that is expected, not
 *     an error.
 *   - `readings.flowMeter` is NEW, optional: raw cumulative-volume /
 *     flow-rate readings from a device with an inline flow meter on
 *     its irrigation line. This is a periodic SENSOR reading, distinct
 *     from `IrrigationEvent.appliedWaterVolumeLiters` (irrigationEvent.
 *     model.js), which is the single per-event applied-volume total
 *     reported by the device when it confirms a command's execution
 *     result (see commands.controller.js / commands.validators.js).
 *     Nothing here computes one from the other — see irrigationEvent.
 *     model.js's own comment for why that derivation is deliberately
 *     NOT implemented.
 */

const mongoose = require('mongoose');

const telemetrySchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true },
    // Server-derived from the authenticated device (Device.farmId /
    // Device.zoneId) at ingestion time — see telemetry.service.js.
    // Required because every device is required to belong to a farm
    // (Device.farmId is required); zoneId stays optional because zone
    // assignment is optional and may postdate device provisioning.
    farmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true },
    zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', default: null },
    messageId: { type: String, required: true },
    sequenceNumber: { type: Number },
    recordedAt: { type: Date, required: true }, // server receipt time — authoritative
    deviceReportedAt: { type: Date }, // device's own clock — reference only, never trusted alone
    readings: {
      soilMoisturePercent: { type: Number, min: 0, max: 100 },
      soilSalinityPpt: { type: Number, min: 0 }, // unit: parts per thousand (ppt)
      temperatureCelsius: { type: Number, min: -40, max: 85 }, // soil-probe temperature — see header comment
      soilEcMicrosiemensPerCm: { type: Number, min: 0 }, // unit: microsiemens/cm, raw (unconverted) EC
      airTemperatureCelsius: { type: Number, min: -40, max: 60 }, // ambient weather context, if available
      relativeHumidityPercent: { type: Number, min: 0, max: 100 }, // ambient weather context, if available
      precipitationMm: { type: Number, min: 0 }, // unit: millimeters, if available
      flowMeter: {
        cumulativeVolumeLiters: { type: Number, min: 0 },
        flowRateLitersPerMinute: { type: Number, min: 0 },
      },
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
