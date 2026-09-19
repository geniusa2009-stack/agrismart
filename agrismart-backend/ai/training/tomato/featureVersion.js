'use strict';

/**
 * ai/training/tomato/featureVersion.js
 *
 * Separate feature-version namespace from ai/features/featureVersion.js
 * (that one is for AgriSmart's own time-series irrigation-need model;
 * this one is for the cross-sectional Mendeley tomato dataset — the
 * two must never be confused or merged).
 */

const FEATURE_VERSION = 'tomato-v1';

// Order matters: this is the exact column order fed to the model.
const NUMERIC_FEATURE_NAMES = [
  'airTemperatureCelsius',
  'relativeHumidityPercent',
  'referenceEvapotranspiration',
  'evapotranspiration',
  'cropCoefficient',
  'soilNitrogenMgPerKg',
  'soilPhosphorusMgPerKg',
  'soilPotassiumMgPerKg',
  'solarRadiationWPerM2',
  'windSpeedMPerS',
  'daysSincePlanting',
  'soilPh',
];

const CROP_STAGE_ORDER = ['Initial Stage', 'Development Stage', 'Mid stage', 'Last stage'];

// One-hot columns appended after the numeric features, in this fixed order.
const FEATURE_NAMES = [...NUMERIC_FEATURE_NAMES, ...CROP_STAGE_ORDER.map((s) => `cropStage:${s}`)];

const TARGET_NAME = 'soilMoistureRaw';

module.exports = { FEATURE_VERSION, NUMERIC_FEATURE_NAMES, CROP_STAGE_ORDER, FEATURE_NAMES, TARGET_NAME };
