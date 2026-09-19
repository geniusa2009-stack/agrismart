'use strict';

/**
 * ai/training/logisticRegression.js
 *
 * A small, dependency-free logistic regression classifier (batch
 * gradient descent + L2 regularization). Deliberately not a
 * npm ML library or XGBoost/LightGBM: the dataset this MVP can
 * realistically produce (tens of thousands of rows at most, 16
 * features) does not need gradient boosting, and a from-scratch
 * implementation keeps the whole pipeline auditable, dependency-light,
 * and CPU-trivial (spec section 6/18: simplest model that clears the
 * baseline, no unnecessary complexity or heavy dependencies).
 *
 * Missing (null) feature values are mean-imputed using statistics
 * computed ONLY from the training split (imputation stats are part of
 * the saved model artifact) — never from validation/test, which would
 * leak information across the split.
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

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

/**
 * @param {number[][]} X raw (possibly-null) feature rows
 * @param {number[]} y labels (0/1)
 * @param {object} opts
 * @returns {object} trained model params + preprocessing stats
 */
function trainLogisticRegression(X, y, { epochs = 300, learningRate = 0.1, l2 = 0.01 } = {}) {
  const imputationMeans = computeImputationStats(X);
  const imputed = impute(X, imputationMeans);
  const { scaled, mean, std } = standardize(imputed);

  const n = scaled.length;
  const nFeatures = scaled[0].length;
  let weights = new Array(nFeatures).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradW = new Array(nFeatures).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i += 1) {
      const row = scaled[i];
      let z = bias;
      for (let j = 0; j < nFeatures; j += 1) z += weights[j] * row[j];
      const pred = sigmoid(z);
      const error = pred - y[i];
      for (let j = 0; j < nFeatures; j += 1) gradW[j] += error * row[j];
      gradB += error;
    }
    for (let j = 0; j < nFeatures; j += 1) {
      weights[j] -= learningRate * (gradW[j] / n + l2 * weights[j]);
    }
    bias -= learningRate * (gradB / n);
  }

  return { weights, bias, imputationMeans, standardizeMean: mean, standardizeStd: std, epochs, learningRate, l2 };
}

function predictProbaLogisticRegression(model, X) {
  const imputed = impute(X, model.imputationMeans);
  const scaled = applyStandardize(imputed, model.standardizeMean, model.standardizeStd);
  return scaled.map((row) => {
    let z = model.bias;
    for (let j = 0; j < row.length; j += 1) z += model.weights[j] * row[j];
    return sigmoid(z);
  });
}

module.exports = {
  trainLogisticRegression,
  predictProbaLogisticRegression,
  computeImputationStats,
  impute,
};
