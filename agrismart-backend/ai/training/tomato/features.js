'use strict';

/**
 * ai/training/tomato/features.js
 *
 * Builds a numeric feature matrix from real TomatoObservationSchema
 * records. This is a CONCURRENT regression, not a forecast: every
 * feature here is measured at the same "instant" (same row) as the
 * soil-moisture target. There is no lag/rolling/future-window feature
 * because the source data has no fine-grained timestamp to compute
 * one from — only a whole-day ordinal ("Days of planted"). This must
 * not be confused with AgriSmart's own irrigation_need_next_3h model,
 * which forecasts forward in time using lag features; this model only
 * estimates a CURRENT soil-moisture reading from other CURRENT
 * concurrent measurements (a virtual-sensor / sensor-fusion task).
 */

const { NUMERIC_FEATURE_NAMES, CROP_STAGE_ORDER, FEATURE_NAMES, TARGET_NAME } = require('./featureVersion');

function oneHotStage(stage) {
  return CROP_STAGE_ORDER.map((s) => (s === stage ? 1 : 0));
}

function buildFeatureMatrix(records) {
  const X = records.map((r) => [...NUMERIC_FEATURE_NAMES.map((f) => r[f]), ...oneHotStage(r.cropStage)]);
  const y = records.map((r) => r[TARGET_NAME]);
  return { X, y, featureNames: FEATURE_NAMES };
}

module.exports = { buildFeatureMatrix };
