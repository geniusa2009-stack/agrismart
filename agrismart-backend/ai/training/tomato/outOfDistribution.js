'use strict';

/**
 * ai/training/tomato/outOfDistribution.js
 *
 * Same lightweight per-feature [min,max]+margin OOD approach as
 * ai/inference/outOfDistribution.js, reimplemented here parametrized
 * by an explicit featureNames list instead of importing the
 * irrigation-model's hardcoded FEATURE_NAMES — this dataset has a
 * different feature set (see featureVersion.js) and must not share
 * that module's fixed column list.
 */

const MARGIN_FRACTION = 0.15;

function computeFeatureRanges(matrix, featureNames) {
  const ranges = {};
  for (let j = 0; j < featureNames.length; j += 1) {
    const values = matrix.map((row) => row[j]).filter((v) => v !== null && Number.isFinite(v));
    if (values.length === 0) {
      ranges[featureNames[j]] = null;
      continue;
    }
    ranges[featureNames[j]] = { min: Math.min(...values), max: Math.max(...values) };
  }
  return ranges;
}

function checkOutOfDistribution(features, ranges, featureNames) {
  const oodFeatures = [];
  if (!ranges) return { oodFeatures };
  for (const name of featureNames) {
    const value = features[name];
    const range = ranges[name];
    if (value === null || value === undefined || !range) continue;
    const span = range.max - range.min || 1;
    const margin = span * MARGIN_FRACTION;
    if (value < range.min - margin || value > range.max + margin) {
      oodFeatures.push(name);
    }
  }
  return { oodFeatures };
}

module.exports = { computeFeatureRanges, checkOutOfDistribution };
