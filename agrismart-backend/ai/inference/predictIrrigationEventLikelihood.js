'use strict';

/**
 * ai/inference/predictIrrigationEventLikelihood.js
 *
 * Advisory-only, read-only inference for the 'irrigation_event_next_1h'
 * model (ai/training/evolvingTomato/train.js) — predicts the
 * probability that a NEW irrigation event will START within the next
 * hour, learned from a real (external) tomato-cultivation testbed's
 * actual valve-actuation history.
 *
 * Unlike the tomato soil-moisture regression endpoint (Dataset #1),
 * this model's REQUIRED features are the exact same ones
 * ai/inference/predict.js already computes from AgriSmart's own live
 * telemetry + irrigation event log (soilMoisturePercent,
 * temperatureCelsius, soilSalinityPpt, hoursSinceLastIrrigation,
 * irrigationMinutesLast6h/24h, hourOfDay, dayOfWeek) — so this
 * function can be called with the SAME telemetryHistory/
 * irrigationHistory shape as the controller already loads for
 * getRecommendation.
 *
 * CRITICAL CAVEAT (documented here AND enforced structurally by the
 * validation gate below): this model was trained on a DIFFERENT
 * physical site (a research greenhouse testbed in Parma, Italy, not
 * any AgriSmart farm), so even if it clears its own validation
 * criteria, a prediction from it describes "how a similar irrigation
 * controller behaved under similar sensor readings at that other
 * site" — not a normative judgement about what an AgriSmart farm
 * should do. See AI_MODEL_CARD.md.
 *
 * Safety boundary: like every other inference module in ai/, this
 * file MUST NEVER import or call commandsService / irrigationService's
 * open/closeValve — enforced by a source-scan test.
 */

const { computeFeatures } = require('../features/featureEngineering');
const { FEATURE_VERSION, FEATURE_NAMES } = require('../features/featureVersion');
const { loadLatestModel } = require('../models/modelRegistry');
const { predictProbaLogisticRegression } = require('../training/logisticRegression');
const { explainFeatures } = require('./explain');
const { checkOutOfDistribution } = require('./outOfDistribution');
const { IrrigationEventPredictionSchema } = require('../schemas/irrigationEventPrediction.schema');
const { TARGET } = require('../training/evolvingTomato/train');

const MIN_HISTORY_POINTS = 4;

function unavailable(reason, modelRecord = null) {
  return IrrigationEventPredictionSchema.parse({
    target: TARGET,
    available: false,
    fallback: true,
    synthetic: false,
    probability: null,
    confidence: 'none',
    explanation: [],
    modelVersion: modelRecord ? String(modelRecord.version) : null,
    modelType: modelRecord ? modelRecord.modelType : null,
    modelStatus: modelRecord ? modelRecord.status : null,
    generatedAt: new Date(),
    reason,
  });
}

function predictIrrigationEventLikelihood({ telemetryHistory, irrigationHistory = [], asOf = new Date() }) {
  if (!Array.isArray(telemetryHistory) || telemetryHistory.length < MIN_HISTORY_POINTS) {
    return unavailable(`Fewer than ${MIN_HISTORY_POINTS} telemetry readings available for this device.`);
  }

  const record = loadLatestModel(TARGET);
  if (!record) {
    return unavailable('No irrigation_event_next_1h model has been trained/registered yet.');
  }
  if (record.status !== 'validated' && record.status !== 'active') {
    return unavailable(
      `Latest model (v${record.version}) has status "${record.status}" — it did not meet this project's validation criteria (see AI_TRAINING_REPORT.md: the real-data experiment for this target did not generalize acceptably, both within the 2024 season and against the fully external 2025 season) and is not served.`,
      record
    );
  }
  if (record.featureVersion !== FEATURE_VERSION) {
    return unavailable(`Saved model feature version "${record.featureVersion}" does not match current "${FEATURE_VERSION}".`, record);
  }

  const { features } = computeFeatures(telemetryHistory, irrigationHistory, asOf);
  if (features.soilMoisturePercent === null) {
    return unavailable('No usable current soil moisture reading.', record);
  }

  const row = FEATURE_NAMES.map((name) => features[name]);
  let probability;
  try {
    [probability] = predictProbaLogisticRegression(record.modelParams, [row]);
  } catch (err) {
    return unavailable(`Model inference failed: ${err.message}`, record);
  }

  const { oodFeatures } = checkOutOfDistribution(features, record.modelParams.trainingFeatureRanges);
  if (oodFeatures.length >= 3) {
    return unavailable(`Current readings (${oodFeatures.join(', ')}) are far outside this model's training distribution — refusing to force a prediction.`, record);
  }

  const explanation = explainFeatures(features);
  explanation.push('This model was trained on a different physical site (a research testbed, not an AgriSmart farm) — treat it as a reference signal, not a site-specific recommendation.');
  let confidence = 'medium';
  if (oodFeatures.length > 0) {
    confidence = 'low';
    explanation.push(`Note: ${oodFeatures.join(', ')} ${oodFeatures.length === 1 ? 'is' : 'are'} outside this model's training range.`);
  }

  return IrrigationEventPredictionSchema.parse({
    target: TARGET,
    available: true,
    fallback: false,
    synthetic: false,
    probability: Math.round(probability * 1000) / 1000,
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

module.exports = { predictIrrigationEventLikelihood, unavailable, MIN_HISTORY_POINTS };
