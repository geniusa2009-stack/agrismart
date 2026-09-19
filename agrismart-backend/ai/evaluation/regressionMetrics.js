'use strict';

/**
 * ai/evaluation/regressionMetrics.js
 *
 * Standard regression metrics, dependency-free, for continuous
 * targets (as opposed to ai/evaluation/metrics.js, which is for the
 * binary-classification irrigation_need_next_3h model).
 */

function mae(yTrue, yPred) {
  const n = yTrue.length;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += Math.abs(yTrue[i] - yPred[i]);
  return sum / n;
}

function rmse(yTrue, yPred) {
  const n = yTrue.length;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += (yTrue[i] - yPred[i]) ** 2;
  return Math.sqrt(sum / n);
}

/** Coefficient of determination. Can be negative (worse than predicting the mean). */
function r2Score(yTrue, yPred) {
  const n = yTrue.length;
  const mean = yTrue.reduce((a, b) => a + b, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i += 1) {
    ssRes += (yTrue[i] - yPred[i]) ** 2;
    ssTot += (yTrue[i] - mean) ** 2;
  }
  if (ssTot === 0) return 0;
  return 1 - ssRes / ssTot;
}

function evaluateRegressor(yTrue, yPred) {
  return { mae: mae(yTrue, yPred), rmse: rmse(yTrue, yPred), r2: r2Score(yTrue, yPred), n: yTrue.length };
}

module.exports = { mae, rmse, r2Score, evaluateRegressor };
