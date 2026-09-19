'use strict';

/**
 * ai/training/arnesano/featureVersion.js
 *
 * Feature set for the Arnesano precision-irrigation dataset's
 * 24-hour-ahead soil-moisture forecasting target. Deliberately
 * separate from ai/features/featureVersion.js (AgriSmart's own
 * irrigation-event feature set) and from ai/training/tomato/
 * featureVersion.js (Dataset #1's concurrent-estimation feature set)
 * — this is a THIRD, distinct feature space, matched to what this
 * dataset actually measures.
 */

const FEATURE_VERSION = 'arnesano-v1';

const FEATURE_NAMES = [
  'airTemperature',
  'relativeHumidity',
  'precipitation',
  'solarRadiation',
  'windSpeed',
  'soilTemperature0to7cm',
  'soilTemperature7to18cm',
  'soilEc',
  'soilPh',
  'soilMoisture',
  'irrigationDurationSecondsCurrentBin',
  'waterLitersPast4h',
  'hourOfDay',
  'dayOfWeek',
  'month',
];

// Features that describe applied irrigation (used for the ablation
// study — see AI_ABLATION_REPORT.md).
const IRRIGATION_FEATURE_NAMES = ['irrigationDurationSecondsCurrentBin', 'waterLitersPast4h'];

const TARGET_NAME = 'targetSoilMoisture24hTrueHorizon';

module.exports = { FEATURE_VERSION, FEATURE_NAMES, IRRIGATION_FEATURE_NAMES, TARGET_NAME };
