'use strict';

/**
 * ai/data/syntheticDevData.js
 *
 * *** SYNTHETIC DEVELOPMENT DATA — NOT REAL AGRICULTURAL DATA ***
 *
 * Generates a physically-plausible-but-fabricated telemetry +
 * irrigation history so the ML pipeline (feature engineering, dataset
 * building, chronological splitting, training, evaluation) can be
 * exercised end-to-end before any real telemetry exists.
 *
 * Every value returned by this module is synthetic. Anything derived
 * from it (a trained model, a metric) MUST be tagged
 * `dataSource: 'synthetic-dev'` by the caller and must never be
 * reported as a claim about real-world model accuracy — see
 * ai/README.md and models/modelRegistry.js.
 *
 * The generator is deterministic (seeded PRNG) so pipeline test runs
 * are reproducible.
 */

// Small mulberry32 PRNG — dependency-free, deterministic given a seed.
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {object} opts
 * @param {number} [opts.days=30] length of simulated history
 * @param {number} [opts.intervalMinutes=15] sampling cadence, matching
 *   a realistic ESP32 duty-cycled reporting interval (deliberately NOT
 *   the 4s demo simulator cadence, which exists only for a live
 *   presentation, not for representative training data).
 * @param {number} [opts.seed=42]
 * @param {string} [opts.deviceId='synthetic-dev-001']
 * @param {number} [opts.autoOpenBelowPercent=30]
 * @param {number} [opts.autoCloseAbovePercent=55]
 * @returns {{ telemetry: Array, irrigationEvents: Array, meta: object }}
 */
function generateSyntheticDevDataset({
  days = 30,
  intervalMinutes = 15,
  seed = 42,
  deviceId = 'synthetic-dev-001',
  autoOpenBelowPercent = 30,
  autoCloseAbovePercent = 55,
} = {}) {
  const rng = makeRng(seed);
  const stepMs = intervalMinutes * 60 * 1000;
  const totalSteps = Math.floor((days * 24 * 60) / intervalMinutes);
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const telemetry = [];
  const irrigationEvents = [];

  let moisture = 55 + rng() * 10;
  let temperature = 26;
  let irrigating = false;
  let irrigationStart = null;
  let plannedDurationSeconds = 300;

  for (let i = 0; i < totalSteps; i += 1) {
    const recordedAt = new Date(start.getTime() + i * stepMs);
    const hour = recordedAt.getUTCHours();

    // Diurnal evapotranspiration-like drift: faster moisture loss at
    // midday, slower overnight — a simplified but non-arbitrary shape
    // (sinusoidal by hour of day), not a random walk with no structure.
    const middayFactor = 0.5 + 0.5 * Math.cos(((hour - 14) / 24) * 2 * Math.PI);
    const evapotranspirationLoss = 0.05 + middayFactor * 0.25;

    if (irrigating) {
      moisture += 0.9 + rng() * 0.6;
    } else {
      moisture -= evapotranspirationLoss + rng() * 0.15;
    }
    moisture = Math.max(5, Math.min(95, Math.round(moisture * 100) / 100));

    temperature = 22 + 6 * Math.cos(((hour - 15) / 24) * 2 * Math.PI) + (rng() - 0.5) * 1.5;
    temperature = Math.round(temperature * 10) / 10;
    const soilSalinityPpt = Math.round((1.0 + rng() * 0.4) * 100) / 100;

    telemetry.push({
      recordedAt,
      readings: { soilMoisturePercent: moisture, temperatureCelsius: temperature, soilSalinityPpt },
    });

    // Mirrors the SAME threshold-crossing automation logic already in
    // production (irrigation.service.js evaluateAutomation) so the
    // synthetic irrigation history is at least internally consistent
    // with how the real system behaves, rather than an unrelated
    // invented process.
    if (!irrigating && moisture < autoOpenBelowPercent) {
      irrigating = true;
      irrigationStart = recordedAt;
    } else if (irrigating && moisture > autoCloseAbovePercent) {
      const endedAt = recordedAt;
      const actualDurationSeconds = Math.round((endedAt.getTime() - irrigationStart.getTime()) / 1000);
      irrigationEvents.push({
        startedAt: irrigationStart,
        endedAt,
        actualDurationSeconds,
        plannedDurationSeconds,
      });
      irrigating = false;
      irrigationStart = null;
    }
  }

  return {
    telemetry,
    irrigationEvents,
    meta: {
      synthetic: true,
      deviceId,
      days,
      intervalMinutes,
      seed,
      generatedAt: new Date().toISOString(),
      note: 'SYNTHETIC DEVELOPMENT DATA — fabricated for pipeline testing only, not real agricultural telemetry.',
    },
  };
}

module.exports = { generateSyntheticDevDataset };
