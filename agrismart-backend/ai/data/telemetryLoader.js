'use strict';

/**
 * ai/data/telemetryLoader.js
 *
 * Best-effort loader of REAL data from the existing Mongo models
 * (Telemetry, IrrigationEvent, Valve). Never fabricates data: if Mongo
 * is unreachable or empty, it reports that honestly rather than
 * substituting synthetic data itself (the caller, training/train.js,
 * decides whether to fall back to the clearly-labeled synthetic
 * dataset, and always records which source was used).
 *
 * VALIDATION: every raw Mongo doc is passed through validateTelemetryDoc
 * / validateIrrigationEvent BEFORE it reaches datasetBuilder/feature
 * engineering. A doc that fails validation (missing/unparseable
 * timestamp, non-numeric or out-of-range required reading) is dropped,
 * counted, and never silently coerced. This loader does not guess a
 * missing value; feature engineering already tolerates nulls for
 * OPTIONAL fields, but a record with no usable primary signal is
 * excluded rather than passed through malformed.
 */

const mongoose = require('mongoose');
const Telemetry = require('../../src/modules/telemetry/telemetry.model');
const IrrigationEvent = require('../../src/modules/irrigation/irrigationEvent.model');
const Valve = require('../../src/modules/irrigation/valve.model');
const logger = require('../../src/observability/logger');

/**
 * Validates a raw telemetry doc, returning a clean record or null if
 * it must be dropped. Never guesses a missing value; it is the
 * caller's job to decide how to treat gaps (feature engineering
 * already tolerates nulls for optional fields).
 *
 * Pass-through of the AgriSmart-native data collection contract
 * fields (farmId, zoneId, soil EC, weather, flow meter) is included
 * here so this validated data is available to any future dataset/
 * feature work. This function does NOT add any of these fields to
 * ai/features/featureVersion.js's FEATURE_NAMES and does NOT compute
 * any derived value (no EC->salinity conversion, no unit conversion)
 * — it only preserves what was actually recorded, typed and range-
 * checked, or null if absent/invalid.
 */
function validateTelemetryDoc(doc) {
  if (!doc || !doc.recordedAt) return null;
  const recordedAt = new Date(doc.recordedAt);
  if (Number.isNaN(recordedAt.getTime())) return null;
  const readings = doc.readings || {};
  const soilMoisturePercent =
    typeof readings.soilMoisturePercent === 'number' && readings.soilMoisturePercent >= 0 && readings.soilMoisturePercent <= 100
      ? readings.soilMoisturePercent
      : null;
  // A telemetry point with no usable moisture reading at all is not
  // useful for this problem — drop it, but count it so data quality is
  // visible in the readiness report.
  if (soilMoisturePercent === null) return null;

  const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const flowMeterRaw = readings.flowMeter || {};
  const flowMeter = {
    cumulativeVolumeLiters: numOrNull(flowMeterRaw.cumulativeVolumeLiters),
    flowRateLitersPerMinute: numOrNull(flowMeterRaw.flowRateLitersPerMinute),
  };
  const hasFlowMeter = flowMeter.cumulativeVolumeLiters !== null || flowMeter.flowRateLitersPerMinute !== null;

  return {
    recordedAt,
    // Server-derived ownership context (never trusted from client
    // payloads — see telemetry.controller.js); pass through unchanged.
    farmId: doc.farmId ? String(doc.farmId) : null,
    zoneId: doc.zoneId ? String(doc.zoneId) : null,
    readings: {
      soilMoisturePercent,
      temperatureCelsius: numOrNull(readings.temperatureCelsius),
      soilSalinityPpt: numOrNull(readings.soilSalinityPpt),
      // AgriSmart-native data collection contract additions
      // (ai/external/AGRISMART_DATA_COLLECTION_CONTRACT.md). Preserved
      // as recorded, with explicit units in the field name; null when
      // absent or non-numeric, never derived or coerced.
      soilEcMicrosiemensPerCm: numOrNull(readings.soilEcMicrosiemensPerCm),
      airTemperatureCelsius: numOrNull(readings.airTemperatureCelsius),
      relativeHumidityPercent: numOrNull(readings.relativeHumidityPercent),
      precipitationMm: numOrNull(readings.precipitationMm),
      flowMeter: hasFlowMeter ? flowMeter : null,
    },
  };
}

/**
 * Validates a raw irrigation event doc. Same drop-don't-coerce policy
 * as validateTelemetryDoc. appliedWaterVolumeLiters is passed through
 * exactly as recorded by commands.controller.js's reportExecutionResult
 * (device-reported, never derived from duration or an assumed flow
 * rate here or anywhere else).
 */
function validateIrrigationEvent(doc) {
  if (!doc || !doc.startedAt) return null;
  const startedAt = new Date(doc.startedAt);
  if (Number.isNaN(startedAt.getTime())) return null;
  return {
    startedAt,
    endedAt: doc.endedAt ? new Date(doc.endedAt) : null,
    actualDurationSeconds: typeof doc.actualDurationSeconds === 'number' ? doc.actualDurationSeconds : null,
    plannedDurationSeconds: typeof doc.plannedDurationSeconds === 'number' ? doc.plannedDurationSeconds : 0,
    appliedWaterVolumeLiters:
      typeof doc.appliedWaterVolumeLiters === 'number' && Number.isFinite(doc.appliedWaterVolumeLiters) && doc.appliedWaterVolumeLiters >= 0
        ? doc.appliedWaterVolumeLiters
        : null,
  };
}

/**
 * @returns {Promise<{ ok: boolean, reason?: string, valves: Array, telemetryByDevice: Map, irrigationByValve: Map, counts: object }>}
 */
async function loadRealDataset({ connectTimeoutMs = 3000 } = {}) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return { ok: false, reason: 'MONGODB_URI is not set.', valves: [], telemetryByDevice: new Map(), irrigationByValve: new Map(), counts: {} };
  }

  let ownConnection = null;
  try {
    if (mongoose.connection.readyState !== 1) {
      ownConnection = await mongoose
        .createConnection(uri, { serverSelectionTimeoutMS: connectTimeoutMs })
        .asPromise();
    }
    const conn = ownConnection || mongoose.connection;

    const ValveModel = ownConnection ? conn.model('Valve', Valve.schema) : Valve;
    const TelemetryModel = ownConnection ? conn.model('Telemetry', Telemetry.schema) : Telemetry;
    const IrrigationEventModel = ownConnection ? conn.model('IrrigationEvent', IrrigationEvent.schema) : IrrigationEvent;

    const valves = await ValveModel.find({}).lean();
    const telemetryByDevice = new Map();
    const irrigationByValve = new Map();
    let telemetryCount = 0;
    let irrigationCount = 0;
    let invalidTelemetryDropped = 0;
    let invalidIrrigationEventsDropped = 0;

    for (const valve of valves) {
      const rawTelemetry = await TelemetryModel.find({ deviceId: valve.deviceId })
        .sort({ recordedAt: 1 })
        .lean();
      const telemetry = [];
      for (const doc of rawTelemetry) {
        const validated = validateTelemetryDoc(doc);
        if (validated) {
          telemetry.push(validated);
        } else {
          invalidTelemetryDropped += 1;
        }
      }
      telemetryByDevice.set(valve.deviceId, telemetry);
      telemetryCount += telemetry.length;

      const rawEvents = await IrrigationEventModel.find({ valveId: valve._id })
        .sort({ startedAt: 1 })
        .lean();
      const events = [];
      for (const doc of rawEvents) {
        const validated = validateIrrigationEvent(doc);
        if (validated) {
          events.push(validated);
        } else {
          invalidIrrigationEventsDropped += 1;
        }
      }
      irrigationByValve.set(String(valve._id), events);
      irrigationCount += events.length;
    }

    if (ownConnection) await ownConnection.close();

    return {
      ok: true,
      valves,
      telemetryByDevice,
      irrigationByValve,
      counts: {
        valves: valves.length,
        telemetryReadings: telemetryCount,
        irrigationEvents: irrigationCount,
        invalidTelemetryDropped,
        invalidIrrigationEventsDropped,
      },
    };
  } catch (err) {
    if (ownConnection) {
      try {
        await ownConnection.close();
      } catch (_) {
        /* ignore */
      }
    }
    logger.warn({ scope: 'ai', err: err.message }, 'AI data loader: could not reach real telemetry store.');
    return { ok: false, reason: err.message, valves: [], telemetryByDevice: new Map(), irrigationByValve: new Map(), counts: {} };
  }
}

module.exports = { loadRealDataset, validateTelemetryDoc, validateIrrigationEvent };
