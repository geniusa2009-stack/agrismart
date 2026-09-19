'use strict';

/**
 * ai/data/datasetBuilder.js
 *
 * Turns validated telemetry + irrigation history for ONE device/valve
 * into a chronologically-ordered list of labeled examples for the
 * "irrigation need within next 3h" classification problem.
 *
 * Sampling: one candidate example per telemetry reading, EXCLUDING
 * readings where moisture is already below threshold at asOf (that is
 * "needs water now", a different, simpler problem already handled by
 * the existing rule engine — not what this model predicts) and
 * excluding the trailing horizon window (not enough future data to
 * know the true label yet).
 *
 * This module never shuffles anything — order is preserved so
 * training/splitChronological.js can safely assume ascending time.
 */

const { computeFeatures, computeLabel } = require('../features/featureEngineering');

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_HORIZON_MS = 3 * HOUR_MS;

function buildExamplesForDevice({
  deviceId,
  valveId,
  farmId,
  telemetryHistory,
  irrigationHistory,
  thresholdPercent,
  horizonMs = DEFAULT_HORIZON_MS,
}) {
  const examples = [];
  let skippedAlreadyBelow = 0;
  let skippedNoFutureLabel = 0;

  for (const point of telemetryHistory) {
    const asOf = point.recordedAt;
    const { featureVersion, features } = computeFeatures(telemetryHistory, irrigationHistory, asOf);

    if (features.soilMoisturePercent === null) continue; // unusable point
    if (features.soilMoisturePercent < thresholdPercent) {
      skippedAlreadyBelow += 1;
      continue;
    }

    const label = computeLabel(telemetryHistory, asOf, horizonMs, thresholdPercent);
    if (label === null) {
      skippedNoFutureLabel += 1;
      continue;
    }

    examples.push({
      deviceId,
      valveId,
      farmId,
      asOf,
      featureVersion,
      features,
      label: label ? 1 : 0,
    });
  }

  return { examples, skippedAlreadyBelow, skippedNoFutureLabel };
}

/**
 * Builds the full dataset across every valve/device provided, plus a
 * data-readiness summary (never asserts sufficiency — the caller
 * decides what to do with it).
 */
function buildDataset({ valves, telemetryByDevice, irrigationByValve, horizonMs = DEFAULT_HORIZON_MS }) {
  let examples = [];
  let totalRawTelemetry = 0;
  let totalIrrigationEvents = 0;
  let devicesWithData = 0;
  const perDevice = [];

  for (const valve of valves) {
    const deviceId = valve.deviceId;
    const telemetryHistory = (telemetryByDevice.get(deviceId) || []).slice().sort((a, b) => a.recordedAt - b.recordedAt);
    const irrigationHistory = (irrigationByValve.get(String(valve._id)) || []).slice().sort((a, b) => a.startedAt - b.startedAt);

    totalRawTelemetry += telemetryHistory.length;
    totalIrrigationEvents += irrigationHistory.length;
    if (telemetryHistory.length === 0) continue;
    devicesWithData += 1;

    const thresholdPercent = typeof valve.autoOpenBelowPercent === 'number' ? valve.autoOpenBelowPercent : 30;

    const { examples: deviceExamples, skippedAlreadyBelow, skippedNoFutureLabel } = buildExamplesForDevice({
      deviceId,
      valveId: String(valve._id),
      farmId: String(valve.farmId),
      telemetryHistory,
      irrigationHistory,
      thresholdPercent,
      horizonMs,
    });

    examples = examples.concat(deviceExamples);
    perDevice.push({
      deviceId,
      rawTelemetryPoints: telemetryHistory.length,
      irrigationEvents: irrigationHistory.length,
      labeledExamples: deviceExamples.length,
      skippedAlreadyBelow,
      skippedNoFutureLabel,
      firstReadingAt: telemetryHistory[0].recordedAt,
      lastReadingAt: telemetryHistory[telemetryHistory.length - 1].recordedAt,
    });
  }

  examples.sort((a, b) => a.asOf - b.asOf);

  const positives = examples.filter((e) => e.label === 1).length;
  const readiness = {
    devicesTotal: valves.length,
    devicesWithData,
    totalRawTelemetryPoints: totalRawTelemetry,
    totalIrrigationEvents,
    totalLabeledExamples: examples.length,
    positiveExamples: positives,
    negativeExamples: examples.length - positives,
    classBalance: examples.length ? Math.round((positives / examples.length) * 1000) / 1000 : null,
    perDevice,
  };

  return { examples, readiness };
}

module.exports = { buildDataset, buildExamplesForDevice, DEFAULT_HORIZON_MS };
