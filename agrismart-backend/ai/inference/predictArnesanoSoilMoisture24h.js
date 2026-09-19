'use strict';

/**
 * ai/inference/predictArnesanoSoilMoisture24h.js
 *
 * Advisory-ONLY, manual-input research endpoint for the
 * 'arnesano_soil_moisture_24h_forecast' model (ai/training/arnesano/train.js),
 * trained on the real Arnesano precision-irrigation field-trial
 * dataset. Mirrors ai/inference/predictTomatoSoilMoisture.js's
 * structure: this model's features (on-site EC/pH, ERA5 weather,
 * irrigation minutes) are NOT AgriSmart's live telemetry shape, so
 * the caller supplies a concurrent observation directly, exactly like
 * the tomato regression endpoint.
 *
 * CRITICAL CAVEAT, enforced structurally (every successful response
 * carries it): this model's own registered result shows it barely
 * edges out a persistence baseline in-distribution and FAILS to beat
 * that baseline on a held-out crop (blueberry, zone 5) — see
 * AI_MODEL_CARD.md. Even if promoted, a caller should not expect this
 * model to outperform "assume tomorrow looks like today" by much, if
 * at all, outside the exact crop/site it was trained on.
 *
 * Safety boundary: never imports/calls commandsService/irrigationService.
 */

const { z } = require('zod');
const { predictRidgeRegression } = require('../training/tomato/linearRegression');
const { loadLatestModel } = require('../models/modelRegistry');
const { checkOutOfDistribution } = require('../training/arnesano/outOfDistribution');
const { FEATURE_VERSION, FEATURE_NAMES } = require('../training/arnesano/featureVersion');
const { ArnesanoSoilMoisturePredictionSchema } = require('../schemas/arnesanoSoilMoisturePrediction.schema');

// Every field optional+nullable: callers may legitimately not know
// every value (e.g. no on-site EC/pH probe available), and a missing
// field is imputed by the model's OWN train-fitted imputation means
// (never fabricated here) — this schema only rejects wrong TYPES,
// never rejects an incomplete-but-honest observation.
const InputSchema = z.object({
  airTemperature: z.number().nullable().optional(),
  relativeHumidity: z.number().nullable().optional(),
  precipitation: z.number().nullable().optional(),
  solarRadiation: z.number().nullable().optional(),
  windSpeed: z.number().nullable().optional(),
  soilTemperature0to7cm: z.number().nullable().optional(),
  soilTemperature7to18cm: z.number().nullable().optional(),
  soilEc: z.number().nullable().optional(),
  soilPh: z.number().nullable().optional(),
  soilMoisture: z.number().nullable().optional(),
  irrigationDurationSecondsCurrentBin: z.number().nullable().optional(),
  waterLitersPast4h: z.number().nullable().optional(),
  hourOfDay: z.number().nullable().optional(),
  dayOfWeek: z.number().nullable().optional(),
  month: z.number().nullable().optional(),
});
const { TARGET } = require('../training/arnesano/train');

function unavailable(reason, modelRecord = null) {
  return ArnesanoSoilMoisturePredictionSchema.parse({
    target: TARGET,
    available: false,
    fallback: true,
    synthetic: false,
    predictedSoilMoisturePercent: null,
    confidence: 'none',
    explanation: [],
    modelVersion: modelRecord ? String(modelRecord.version) : null,
    modelType: modelRecord ? modelRecord.modelType : null,
    modelStatus: modelRecord ? modelRecord.status : null,
    generatedAt: new Date(),
    reason,
  });
}

/**
 * @param {object} observation - one row matching ai/training/arnesano/featureVersion.js's FEATURE_NAMES
 */
function predictArnesanoSoilMoisture24h(observation) {
  const record = loadLatestModel(TARGET);
  if (!record) return unavailable('No arnesano_soil_moisture_24h_forecast model has been trained/registered yet.');
  if (record.status !== 'validated' && record.status !== 'active') {
    return unavailable(
      `Latest model (v${record.version}) has status "${record.status}" — it did not meet this project's validation criteria (it fails to beat a simple persistence baseline on a held-out crop/zone; see AI_TRAINING_REPORT.md and AI_MODEL_CARD.md) and is not served.`,
      record
    );
  }
  if (record.featureVersion !== FEATURE_VERSION) {
    return unavailable(`Saved model feature version "${record.featureVersion}" does not match current "${FEATURE_VERSION}".`, record);
  }

  const parsedInput = InputSchema.safeParse(observation || {});
  if (!parsedInput.success) {
    return unavailable(`Invalid input: ${JSON.stringify(parsedInput.error.issues)}`, record);
  }
  const row = FEATURE_NAMES.map((name) => (typeof parsedInput.data[name] === 'number' ? parsedInput.data[name] : null));
  if (row.every((v) => v === null)) {
    return unavailable('No usable features supplied in the observation.', record);
  }

  let prediction;
  try {
    [prediction] = predictRidgeRegression(record.modelParams, [row]);
  } catch (err) {
    return unavailable(`Model inference failed: ${err.message}`, record);
  }

  const features = {};
  FEATURE_NAMES.forEach((name, i) => { features[name] = row[i]; });
  const { oodFeatures } = checkOutOfDistribution(features, record.modelParams.trainingFeatureRanges, FEATURE_NAMES);
  if (oodFeatures.length >= 3) {
    return unavailable(`Current inputs (${oodFeatures.join(', ')}) are far outside this model's training distribution — refusing to force a prediction.`, record);
  }

  const explanation = [
    'This model was trained on a different physical site (a precision-irrigation field trial in Arnesano, Italy, not an AgriSmart farm) and a limited set of crops (open-field tomato, zucchini) — treat it as a reference signal, not a site-specific recommendation.',
    'Even in its own validation, this model only marginally outperforms a naive "assume tomorrow looks like today" persistence baseline, and did NOT outperform that baseline on a held-out crop (blueberry) in this project\'s own cross-crop check.',
  ];
  let confidence = 'medium';
  if (oodFeatures.length > 0) {
    confidence = 'low';
    explanation.push(`Note: ${oodFeatures.join(', ')} ${oodFeatures.length === 1 ? 'is' : 'are'} outside this model's training range.`);
  }

  return ArnesanoSoilMoisturePredictionSchema.parse({
    target: TARGET,
    available: true,
    fallback: false,
    synthetic: false,
    predictedSoilMoisturePercent: Math.round(prediction * 100) / 100,
    confidence,
    explanation,
    modelVersion: String(record.version),
    modelType: record.modelType,
    modelStatus: record.status,
    generatedAt: new Date(),
    reason: null,
    outOfDistribution: oodFeatures.length > 0,
  });
}

module.exports = { predictArnesanoSoilMoisture24h, InputSchema };
