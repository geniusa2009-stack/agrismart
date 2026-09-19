'use strict';

/**
 * ai/training/arnesano/outOfDistribution.js
 * Same lightweight per-feature [min,max]+margin OOD approach as
 * ai/training/tomato/outOfDistribution.js, parametrized by this
 * dataset's own feature list (ai/training/arnesano/featureVersion.js).
 */

const MARGIN_FRACTION = 0.15;

function computeFeatureRanges(matrix, featureNames) {
  const ranges = {};
  for (let j = 0; j < featureNames.length; j += 1) {
    const values = matrix.map((row) => row[j]).filter((v) => v !== null && Number.isFinite(v));
    ranges[featureNames[j]] = values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
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
    if (value < range.min - margin || value > range.max + margin) oodFeatures.push(name);
  }
  return { oodFeatures };
}

module.exports = { computeFeatureRanges, checkOutOfDistribution };
