'use strict';

/**
 * ai/features/featureVersion.js
 *
 * Bump FEATURE_VERSION any time the shape or semantics of a feature
 * changes. Model artifacts record the FEATURE_VERSION they were
 * trained with (models/modelRegistry.js); inference refuses to serve
 * a model whose feature version doesn't match the extractor currently
 * running, rather than silently feeding it mismatched inputs.
 */

const FEATURE_VERSION = 'v1';

// Ordered list of numeric feature names a feature vector produces.
// Kept as an explicit array (not just "whatever the object has") so
// training and inference always align features to the same columns
// in the same order.
const FEATURE_NAMES = [
  'soilMoisturePercent',
  'soilMoistureLag1h',
  'soilMoistureLag3h',
  'soilMoistureLag6h',
  'moistureChange1h',
  'moistureRollingAvg3h',
  'moistureRollingMin6h',
  'moistureRollingMax6h',
  'moistureTrendPerHour',
  'temperatureCelsius',
  'soilSalinityPpt',
  'hoursSinceLastIrrigation',
  'irrigationMinutesLast6h',
  'irrigationMinutesLast24h',
  'hourOfDay',
  'dayOfWeek',
];

module.exports = { FEATURE_VERSION, FEATURE_NAMES };
