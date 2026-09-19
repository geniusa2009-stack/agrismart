'use strict';

/**
 * ai/training/arnesano/baseline.js
 *
 * Baselines the trained model must beat before promotion — see
 * ai/training/tomato/baseline.js for the same principle applied to
 * Dataset #1. Persistence is the operative "strong simple baseline"
 * here: soil moisture is strongly autocorrelated, so "predict the
 * current reading, unchanged, 24h from now" is a much harder bar to
 * clear than a plain mean baseline.
 */

function meanBaseline(trainY) {
  const mean = trainY.reduce((a, b) => a + b, 0) / trainY.length;
  return { predict: (examples) => examples.map(() => mean), mean };
}

/** Predicts the CURRENT soil moisture reading, unchanged, as the 24h-ahead forecast. */
function persistenceBaseline() {
  return { predict: (examples) => examples.map((e) => e.features.soilMoisture) };
}

module.exports = { meanBaseline, persistenceBaseline };
