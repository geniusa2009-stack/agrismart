'use strict';

/**
 * ai/inference/predictTomatoSoilMoisture.js
 *
 * Advisory-only, READ-ONLY inference for the tomato soil-moisture
 * regression model trained in ai/training/tomato/train.js. Like
 * ai/inference/predict.js, this module MUST NEVER import or call
 * anything that actuates a valve (commandsService / irrigationService
 * open/closeValve) — enforced by tests/ai/safetyBoundary.test.js style
 * source-scanning, mirrored for this file in
 * tests/ai/tomato/safetyBoundary.test.js.
 *
 * Critical honesty gate: this only serves a prediction if the latest
 * registered model for this target has status 'validated' or 'active'
 * — i.e. it actually cleared its baseline-comparison validation
 * criteria (ai/training/tomato/train.js). A 'candidate' model (one
 * that failed to beat its baselines) is refused here, the same way
 * ai/inference/predict.js refuses when there isn't enough telemetry
 * history — "AI insight unavailable" beats a confident-looking wrong
 * number.
 */

const { z } = require('zod');
const { loadLatestModel } = require('../models/modelRegistry');
const { predictRidgeRegression } = require('../training/tomato/linearRegression');
const { buildFeatureMatrix } = require('../training/tomato/features');
const { checkOutOfDistribution } = require('../training/tomato/outOfDistribution');
const { FEATURE_NAMES, CROP_STAGE_ORDER } = require('../training/tomato/featureVersion');
const { RegressionPredictionSchema } = require('../schemas/regressionPrediction.schema');
const { TARGET } = require('../training/tomato/train');

const InputSchema = z.object({
  airTemperatureCelsius: z.number(),
  relativeHumidityPercent: z.number(),
  referenceEvapotranspiration: z.number(),
  evapotranspiration: z.number(),
  cropCoefficient: z.number(),
  soilNitrogenMgPerKg: z.number(),
  soilPhosphorusMgPerKg: z.number(),
  soilPotassiumMgPerKg: z.number(),
  solarRadiationWPerM2: z.number(),
  windSpeedMPerS: z.number(),
  daysSincePlanting: z.number(),
  soilPh: z.number(),
  cropStage: z.enum(CROP_STAGE_ORDER),
}).strict();

function unavailable(reason, modelRecord = null) {
  return RegressionPredictionSchema.parse({
    target: TARGET,
    available: false,
    fallback: true,
    synthetic: false,
    estimatedValue: null,
    unit: null,
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
 * @param {object} rawInput - a single concurrent observation, matching InputSchema
 */
function predictSoilMoistureEstimate(rawInput) {
  const modelRecord = loadLatestModel(TARGET);

  if (!modelRecord) {
    return unavailable('No tomato soil-moisture model has been trained/registered yet.');
  }
  if (modelRecord.status !== 'validated' && modelRecord.status !== 'active') {
    return unavailable(
      `Latest model (v${modelRecord.version}) has status "${modelRecord.status}" — it did not meet validation criteria (did not beat both baselines with a positive R^2 on the held-out test split) and is not served. See AI_TRAINING_REPORT.md.`,
      modelRecord
    );
  }

  const parsedInput = InputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    return unavailable(`Invalid input: ${JSON.stringify(parsedInput.error.issues)}`, modelRecord);
  }

  const { X } = buildFeatureMatrix([parsedInput.data]);
  const featuresByName = {};
  FEATURE_NAMES.forEach((name, idx) => {
    featuresByName[name] = X[0][idx];
  });

  const ranges = modelRecord.modelParams.trainingFeatureRanges;
  const { oodFeatures } = checkOutOfDistribution(featuresByName, ranges, FEATURE_NAMES);

  if (oodFeatures.length >= 3) {
    return unavailable(`Input is out-of-distribution on ${oodFeatures.length} features relative to training data (${oodFeatures.join(', ')}) — refusing to extrapolate.`, modelRecord);
  }

  const [estimatedValue] = predictRidgeRegression(modelRecord.modelParams, X);

  const explanation = [
    `Estimated from crop stage "${parsedInput.data.cropStage}" and ${FEATURE_NAMES.length - CROP_STAGE_ORDER.length} concurrent environmental/agronomic readings.`,
  ];
  if (oodFeatures.length > 0) {
    explanation.push(`Note: ${oodFeatures.join(', ')} are outside the training data's observed range — treat this estimate with reduced confidence.`);
  }
  explanation.push(`Model test-set performance: R^2=${modelRecord.metrics.r2.toFixed(3)}, MAE=${modelRecord.metrics.mae.toFixed(1)} (raw sensor units) — see AI_TRAINING_REPORT.md for what this does and does not mean.`);

  return RegressionPredictionSchema.parse({
    target: TARGET,
    available: true,
    fallback: false,
    synthetic: false,
    estimatedValue,
    unit: 'raw sensor units (source unit unconfirmed — see provenance.originalUnits)',
    confidence: oodFeatures.length > 0 ? 'low' : 'medium',
    explanation,
    modelVersion: String(modelRecord.version),
    modelType: modelRecord.modelType,
    modelStatus: modelRecord.status,
    generatedAt: new Date(),
    reason: null,
    outOfDistribution: oodFeatures.length > 0,
  });
}

module.exports = { predictSoilMoistureEstimate, unavailable, InputSchema };
