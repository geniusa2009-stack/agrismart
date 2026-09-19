'use strict';

/**
 * ai/training/tomato/baseline.js
 *
 * Strong-simple baselines the ML model must beat before it is
 * considered validated (spec: "compare against strong simple
 * baselines" / never claim ML value without a baseline comparison).
 */

/** Predicts the train-split's mean soil moisture for every row. */
function meanBaseline(trainY) {
  const mean = trainY.reduce((a, b) => a + b, 0) / trainY.length;
  return {
    predict: (rows) => rows.map(() => mean),
    mean,
  };
}

/**
 * Predicts the train-split's mean soil moisture WITHIN the same crop
 * stage (falls back to the global mean for a stage unseen in train).
 * Stronger than the plain mean baseline if crop stage carries real
 * signal about typical soil moisture.
 */
function stageMeanBaseline(trainRecords, trainY) {
  const globalMean = trainY.reduce((a, b) => a + b, 0) / trainY.length;
  const sums = {};
  const counts = {};
  trainRecords.forEach((r, i) => {
    sums[r.cropStage] = (sums[r.cropStage] || 0) + trainY[i];
    counts[r.cropStage] = (counts[r.cropStage] || 0) + 1;
  });
  const meansByStage = {};
  for (const stage of Object.keys(sums)) meansByStage[stage] = sums[stage] / counts[stage];

  return {
    predict: (records) => records.map((r) => (meansByStage[r.cropStage] !== undefined ? meansByStage[r.cropStage] : globalMean)),
    meansByStage,
  };
}

module.exports = { meanBaseline, stageMeanBaseline };
