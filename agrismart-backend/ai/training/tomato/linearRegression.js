'use strict';

/**
 * ai/training/tomato/linearRegression.js
 *
 * A small, dependency-free ridge linear regression (batch gradient
 * descent + L2), mirroring ai/training/logisticRegression.js's design
 * philosophy: 3,000 rows / 16 features does not justify a heavier
 * model or an npm ML dependency (spec: "do not train a deep model
 * just because it sounds advanced" / "simplest model that clears the
 * baseline"). Standardization stats are fit on TRAIN ONLY.
 */

function computeImputationStats(rows) {
  const nFeatures = rows[0].length;
  const sums = new Array(nFeatures).fill(0);
  const counts = new Array(nFeatures).fill(0);
  for (const row of rows) {
    for (let j = 0; j < nFeatures; j += 1) {
      if (row[j] !== null && Number.isFinite(row[j])) {
        sums[j] += row[j];
        counts[j] += 1;
      }
    }
  }
  return sums.map((s, j) => (counts[j] > 0 ? s / counts[j] : 0));
}

function impute(rows, means) {
  return rows.map((row) => row.map((v, j) => (v === null || !Number.isFinite(v) ? means[j] : v)));
}

function standardize(rows) {
  const n = rows.length;
  const nFeatures = rows[0].length;
  const mean = new Array(nFeatures).fill(0);
  const std = new Array(nFeatures).fill(1);
  for (let j = 0; j < nFeatures; j += 1) {
    let s = 0;
    for (const row of rows) s += row[j];
    mean[j] = s / n;
  }
  for (let j = 0; j < nFeatures; j += 1) {
    let s = 0;
    for (const row of rows) s += (row[j] - mean[j]) ** 2;
    std[j] = Math.sqrt(s / n) || 1;
  }
  const scaled = rows.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  return { scaled, mean, std };
}

function applyStandardize(rows, mean, std) {
  return rows.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
}

/**
 * @param {number[][]} X raw (possibly-null) feature rows
 * @param {number[]} y continuous targets
 */
function trainRidgeRegression(X, y, { epochs = 500, learningRate = 0.1, l2 = 0.01 } = {}) {
  const imputationMeans = computeImputationStats(X);
  const imputed = impute(X, imputationMeans);
  const { scaled, mean, std } = standardize(imputed);

  const n = scaled.length;
  const nFeatures = scaled[0].length;
  let weights = new Array(nFeatures).fill(0);
  let bias = y.reduce((a, b) => a + b, 0) / n; // start at the mean — sensible prior for a weak-signal problem

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradW = new Array(nFeatures).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i += 1) {
      const row = scaled[i];
      let pred = bias;
      for (let j = 0; j < nFeatures; j += 1) pred += weights[j] * row[j];
      const error = pred - y[i];
      for (let j = 0; j < nFeatures; j += 1) gradW[j] += error * row[j];
      gradB += error;
    }
    for (let j = 0; j < nFeatures; j += 1) {
      weights[j] -= learningRate * (2 * gradW[j] / n + 2 * l2 * weights[j]);
    }
    bias -= learningRate * (2 * gradB / n);
  }

  return { weights, bias, imputationMeans, standardizeMean: mean, standardizeStd: std, epochs, learningRate, l2 };
}

function predictRidgeRegression(model, X) {
  const imputed = impute(X, model.imputationMeans);
  const scaled = applyStandardize(imputed, model.standardizeMean, model.standardizeStd);
  return scaled.map((row) => {
    let pred = model.bias;
    for (let j = 0; j < row.length; j += 1) pred += model.weights[j] * row[j];
    return pred;
  });
}

module.exports = { trainRidgeRegression, predictRidgeRegression, computeImputationStats, impute };
