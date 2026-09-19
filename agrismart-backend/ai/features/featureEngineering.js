'use strict';

/**
 * ai/features/featureEngineering.js
 *
 * Pure, dependency-free feature computation. Every function here takes
 * "history up to and including asOf" and never looks past asOf — this
 * is the single place data leakage would be introduced if violated, so
 * it is covered directly by tests/ai/featureEngineering.test.js
 * (including an explicit "future readings must not change the
 * features" leakage test).
 *
 * `readings` (telemetry history) must already be sorted ascending by
 * `recordedAt` before calling these functions — callers (datasetBuilder,
 * inference/predict.js) are responsible for that, so this module can
 * stay allocation-cheap and side-effect-free.
 */

const { FEATURE_VERSION, FEATURE_NAMES } = require('./featureVersion');

const HOUR_MS = 60 * 60 * 1000;

/** Readings with recordedAt in (asOf - windowMs, asOf], ascending. */
function windowUpTo(readings, asOf, windowMs) {
  const lowerBound = asOf.getTime() - windowMs;
  return readings.filter((r) => {
    const t = r.recordedAt.getTime();
    return t <= asOf.getTime() && t > lowerBound;
  });
}

/** Closest reading at or before targetTime, within maxAgeMs, or null. */
function nearestAtOrBefore(readings, targetTime, maxAgeMs) {
  let best = null;
  for (const r of readings) {
    const t = r.recordedAt.getTime();
    if (t > targetTime) break; // ascending order — no need to scan further
    if (targetTime - t > maxAgeMs) continue;
    best = r;
  }
  return best;
}

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function safeMoisture(r) {
  const v = r && r.readings ? r.readings.soilMoisturePercent : undefined;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Builds one feature vector from telemetry history (asc-sorted, all
 * entries with recordedAt <= asOf) and irrigation event history
 * (asc-sorted, all entries with startedAt <= asOf) for a single
 * device/valve, as of `asOf`.
 *
 * @param {Array} telemetryHistory - entries: { recordedAt: Date, readings: { soilMoisturePercent, temperatureCelsius, soilSalinityPpt } }
 * @param {Array} irrigationHistory - entries: { startedAt: Date, endedAt: Date|null, actualDurationSeconds: number|null, plannedDurationSeconds: number }
 * @param {Date} asOf
 * @returns {{ featureVersion: string, features: Record<string, number|null> }}
 */
function computeFeatures(telemetryHistory, irrigationHistory, asOf) {
  const history = telemetryHistory.filter((r) => r.recordedAt.getTime() <= asOf.getTime());
  const current = history.length ? history[history.length - 1] : null;
  const soilMoisturePercent = current ? safeMoisture(current) : null;
  const temperatureCelsius = current && typeof current.readings.temperatureCelsius === 'number'
    ? current.readings.temperatureCelsius
    : null;
  const soilSalinityPpt = current && typeof current.readings.soilSalinityPpt === 'number'
    ? current.readings.soilSalinityPpt
    : null;

  const nowMs = asOf.getTime();

  const lag1 = nearestAtOrBefore(history, nowMs - 1 * HOUR_MS, 30 * 60 * 1000);
  const lag3 = nearestAtOrBefore(history, nowMs - 3 * HOUR_MS, 45 * 60 * 1000);
  const lag6 = nearestAtOrBefore(history, nowMs - 6 * HOUR_MS, 60 * 60 * 1000);

  const soilMoistureLag1h = lag1 ? safeMoisture(lag1) : null;
  const soilMoistureLag3h = lag3 ? safeMoisture(lag3) : null;
  const soilMoistureLag6h = lag6 ? safeMoisture(lag6) : null;

  const moistureChange1h =
    soilMoisturePercent !== null && soilMoistureLag1h !== null
      ? Math.round((soilMoisturePercent - soilMoistureLag1h) * 100) / 100
      : null;

  const rolling3h = windowUpTo(history, asOf, 3 * HOUR_MS).map(safeMoisture).filter((v) => v !== null);
  const rolling6h = windowUpTo(history, asOf, 6 * HOUR_MS).map(safeMoisture).filter((v) => v !== null);

  const moistureRollingAvg3h = rolling3h.length ? Math.round(mean(rolling3h) * 100) / 100 : null;
  const moistureRollingMin6h = rolling6h.length ? Math.min(...rolling6h) : null;
  const moistureRollingMax6h = rolling6h.length ? Math.max(...rolling6h) : null;

  // Linear trend (%/hour) estimated from lag6h -> current, only when
  // both endpoints exist — deliberately simple (two-point slope, not a
  // regression fit) so it stays explainable in plain language.
  let moistureTrendPerHour = null;
  if (soilMoisturePercent !== null && soilMoistureLag6h !== null) {
    const hoursSpan = (nowMs - lag6.recordedAt.getTime()) / HOUR_MS;
    moistureTrendPerHour = hoursSpan > 0
      ? Math.round(((soilMoisturePercent - soilMoistureLag6h) / hoursSpan) * 100) / 100
      : null;
  }

  const priorIrrigation = irrigationHistory.filter((e) => e.startedAt.getTime() <= nowMs);
  const lastIrrigation = priorIrrigation.length ? priorIrrigation[priorIrrigation.length - 1] : null;
  const hoursSinceLastIrrigation = lastIrrigation
    ? Math.round(((nowMs - lastIrrigation.startedAt.getTime()) / HOUR_MS) * 100) / 100
    : null;

  function irrigationSecondsInWindow(windowMs) {
    const cutoff = nowMs - windowMs;
    let seconds = 0;
    for (const ev of priorIrrigation) {
      const start = ev.startedAt.getTime();
      if (start < cutoff) continue;
      const durationSeconds = typeof ev.actualDurationSeconds === 'number'
        ? ev.actualDurationSeconds
        : ev.plannedDurationSeconds || 0;
      seconds += durationSeconds;
    }
    return seconds;
  }

  const irrigationMinutesLast6h = Math.round((irrigationSecondsInWindow(6 * HOUR_MS) / 60) * 100) / 100;
  const irrigationMinutesLast24h = Math.round((irrigationSecondsInWindow(24 * HOUR_MS) / 60) * 100) / 100;

  const hourOfDay = asOf.getUTCHours();
  const dayOfWeek = asOf.getUTCDay();

  const features = {
    soilMoisturePercent,
    soilMoistureLag1h,
    soilMoistureLag3h,
    soilMoistureLag6h,
    moistureChange1h,
    moistureRollingAvg3h,
    moistureRollingMin6h,
    moistureRollingMax6h,
    moistureTrendPerHour,
    temperatureCelsius,
    soilSalinityPpt,
    hoursSinceLastIrrigation,
    irrigationMinutesLast6h,
    irrigationMinutesLast24h,
    hourOfDay,
    dayOfWeek,
  };

  // Defensive: guarantee every declared feature name is present (even
  // if null) and no extra keys sneak in — keeps training/inference
  // column alignment guaranteed.
  for (const name of FEATURE_NAMES) {
    if (!(name in features)) features[name] = null;
  }

  return { featureVersion: FEATURE_VERSION, features };
}

/**
 * Computes the supervised label for irrigation-need prediction:
 * true if, strictly AFTER `asOf` and within `horizonMs`, soil moisture
 * is observed below `thresholdPercent` (and it was NOT already below
 * threshold at asOf — that case is "already needs water now", not
 * "will need water soon", and is excluded from training by the caller).
 * This function is the ONLY place allowed to look forward in time —
 * it must never be called from feature computation.
 */
function computeLabel(telemetryHistory, asOf, horizonMs, thresholdPercent) {
  const future = telemetryHistory.filter((r) => {
    const t = r.recordedAt.getTime();
    return t > asOf.getTime() && t <= asOf.getTime() + horizonMs;
  });
  if (future.length === 0) return null; // unknown — not enough future data to label
  return future.some((r) => {
    const m = safeMoisture(r);
    return m !== null && m < thresholdPercent;
  });
}

module.exports = {
  computeFeatures,
  computeLabel,
  FEATURE_VERSION,
  FEATURE_NAMES,
};
