'use strict';

/**
 * ai/inference/outOfDistribution.js
 *
 * Lightweight OOD (out-of-distribution) detection — spec Task 26:
 * "investigate whether incoming telemetry is outside the training
 * distribution... when detected, mark prediction as lower trust or
 * unavailable. Do not force a prediction."
 *
 * Deliberately simple: per-feature [min, max] observed in the training
 * split (computed once at training time, stored in the model
 * artifact), with a tolerance margin. Not a density model — that would
 * be more MLOps complexity than this MVP's data volume justifies.
 */

const { FEATURE_NAMES } = require('../features/featureVersion');

const MARGIN_FRACTION = 0.15; // 15% beyond the observed training range before flagging

function computeFeatureRanges(matrix) {
  const ranges = {};
  for (let j = 0; j < FEATURE_NAMES.length; j += 1) {
    const values = matrix.map((row) => row[j]).filter((v) => v !== null && Number.isFinite(v));
    if (values.length === 0) {
      ranges[FEATURE_NAMES[j]] = null;
      continue;
    }
    ranges[FEATURE_NAMES[j]] = { min: Math.min(...values), max: Math.max(...values) };
  }
  return ranges;
}

/**
 * @param {Record<string, number|null>} features
 * @param {Record<string, {min:number,max:number}|null>} ranges
 * @returns {{ oodFeatures: string[] }}
 */
function checkOutOfDistribution(features, ranges) {
  const oodFeatures = [];
  if (!ranges) return { oodFeatures };
  for (const name of FEATURE_NAMES) {
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
