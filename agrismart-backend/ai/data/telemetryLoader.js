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
 */

const mongoose = require('mongoose');
const Telemetry = require('../../src/modules/telemetry/telemetry.model');
const IrrigationEvent = require('../../src/modules/irrigation/irrigationEvent.model');
const Valve = require('../../src/modules/irrigation/valve.model');
const logger = require('../../src/observability/logger');

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

    for (const valve of valves) {
      const telemetry = await TelemetryModel.find({ deviceId: valve.deviceId })
        .sort({ recordedAt: 1 })
        .lean();
      telemetryByDevice.set(valve.deviceId, telemetry);
      telemetryCount += telemetry.length;

      const events = await IrrigationEventModel.find({ valveId: valve._id })
        .sort({ startedAt: 1 })
        .lean();
      irrigationByValve.set(String(valve._id), events);
      irrigationCount += events.length;
    }

    if (ownConnection) await ownConnection.close();

    return {
      ok: true,
      valves,
      telemetryByDevice,
      irrigationByValve,
      counts: { valves: valves.length, telemetryReadings: telemetryCount, irrigationEvents: irrigationCount },
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

/**
 * Validates a raw telemetry doc, returning a clean record or null if
 * it must be dropped. Never guesses a missing value; it is the
 * caller's job to decide how to treat gaps (feature engineering
 * already tolerates nulls).
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
  return {
    recordedAt,
    readings: {
      soilMoisturePercent,
      temperatureCelsius: typeof readings.temperatureCelsius === 'number' ? readings.temperatureCelsius : null,
      soilSalinityPpt: typeof readings.soilSalinityPpt === 'number' ? readings.soilSalinityPpt : null,
    },
  };
}

function validateIrrigationEvent(doc) {
  if (!doc || !doc.startedAt) return null;
  const startedAt = new Date(doc.startedAt);
  if (Number.isNaN(startedAt.getTime())) return null;
  return {
    startedAt,
    endedAt: doc.endedAt ? new Date(doc.endedAt) : null,
    actualDurationSeconds: typeof doc.actualDurationSeconds === 'number' ? doc.actualDurationSeconds : null,
    plannedDurationSeconds: typeof doc.plannedDurationSeconds === 'number' ? doc.plannedDurationSeconds : 0,
  };
}

module.exports = { loadRealDataset, validateTelemetryDoc, validateIrrigationEvent };
