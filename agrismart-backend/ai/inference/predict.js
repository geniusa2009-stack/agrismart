'use strict';

/**
 * ai/inference/predict.js
 *
 * The inference entry point: telemetry/irrigation history -> feature
 * extraction -> model lookup -> prediction -> confidence/explanation.
 * NEVER throws for "model unavailable" or "not enough data" — it
 * always resolves to a schema-valid prediction object with
 * `available`/`fallback` flags so callers (services/aiInsightService.js,
 * the API layer) can degrade gracefully rather than crash (spec
 * section 10/17: AI failure must not break irrigation safety).
 */

const { computeFeatures } = require('../features/featureEngineering');
const { FEATURE_VERSION, FEATURE_NAMES } = require('../features/featureVersion');
const { loadLatestModel } = require('../models/modelRegistry');
const { predictProbaLogisticRegression } = require('../training/logisticRegression');
const { explainFeatures } = require('./explain');
const { checkOutOfDistribution } = require('./outOfDistribution');
const { PredictionSchema } = require('../schemas/prediction.schema');
const { TARGET } = require('../training/train');

const MIN_HISTORY_POINTS = 4; // need at least a few readings to say anything at all

function unavailablePrediction(reason) {
  return PredictionSchema.parse({
    target: TARGET,
    available: false,
    fallback: true,
    synthetic: false,
    probability: null,
    confidence: 'none',
    recommendation: 'insufficient_data',
    explanation: [],
    modelVersion: null,
    modelType: null,
    generatedAt: new Date(),
    reason,
  });
}

function confidenceFromContext({ historyPoints, dataSource }) {
  if (dataSource !== 'real') return 'low'; // never claim high confidence off a synthetic-dev model
  if (historyPoints >= 96) return 'high'; // ~24h at 15-min cadence
  if (historyPoints >= 24) return 'medium';
  return 'low';
}

/**
 * @param {object} args
 * @param {Array} args.telemetryHistory - ascending by recordedAt, up to "now"
 * @param {Array} args.irrigationHistory - ascending by startedAt, up to "now"
 * @param {Date} [args.asOf] - defaults to now
 * @returns {object} PredictionSchema-shaped object
 */
function predict({ telemetryHistory, irrigationHistory = [], asOf = new Date() }) {
  if (!Array.isArray(telemetryHistory) || telemetryHistory.length < MIN_HISTORY_POINTS) {
    return unavailablePrediction(`Fewer than ${MIN_HISTORY_POINTS} telemetry readings available for this device.`);
  }

  const record = loadLatestModel(TARGET);
  if (!record) {
    return unavailablePrediction('No trained model artifact exists yet. Run "npm run ai:train".');
  }

  if (record.featureVersion !== FEATURE_VERSION) {
    return unavailablePrediction(
      `Saved model was trained with feature version "${record.featureVersion}", but this code computes "${FEATURE_VERSION}". Retrain before serving predictions.`
    );
  }

  const { features } = computeFeatures(telemetryHistory, irrigationHistory, asOf);

  if (features.soilMoisturePercent === null) {
    return unavailablePrediction('No usable current soil moisture reading.');
  }

  const row = FEATURE_NAMES.map((name) => features[name]);
  let probability;
  try {
    [probability] = predictProbaLogisticRegression(record.modelParams, [row]);
  } catch (err) {
    return unavailablePrediction(`Model inference failed: ${err.message}`);
  }

  // Out-of-distribution check (Task 26): never force a prediction on
  // input the model never saw anything like during training.
  const { oodFeatures } = checkOutOfDistribution(features, record.modelParams.trainingFeatureRanges);
  if (oodFeatures.length >= 3) {
    return unavailablePrediction(
      `Current readings (${oodFeatures.join(', ')}) fall far outside this model's training distribution — refusing to force a prediction rather than guess.`
    );
  }

  const synthetic = record.dataSource !== 'real';
  let confidence = confidenceFromContext({ historyPoints: telemetryHistory.length, dataSource: record.dataSource });
  const explanation = explainFeatures(features);
  if (oodFeatures.length > 0) {
    confidence = 'low'; // never raise trust just because the rest of the pipeline ran fine
    explanation.push(`Note: ${oodFeatures.join(', ')} ${oodFeatures.length === 1 ? 'is' : 'are'} outside the range seen during training — treat this prediction with extra caution.`);
  }

  let recommendation = 'no_action';
  if (probability >= 0.6) recommendation = 'recommend_irrigation';
  else if (probability >= 0.35) recommendation = 'monitor';

  return PredictionSchema.parse({
    target: TARGET,
    available: true,
    fallback: false,
    synthetic,
    probability: Math.round(probability * 1000) / 1000,
    confidence,
    recommendation,
    explanation,
    modelVersion: `v${record.version}`,
    modelType: record.modelType,
    generatedAt: new Date(),
    outOfDistribution: oodFeatures.length > 0,
    reason: synthetic
      ? 'Model trained on synthetic development data only — this prediction is for pipeline demonstration, not a validated agricultural forecast.'
      : null,
  });
}

module.exports = { predict, unavailablePrediction, MIN_HISTORY_POINTS };
