'use strict';

/**
 * ai/training/arnesano/train.js
 *
 * Real-data training pipeline for the Arnesano precision-irrigation
 * dataset. CLI entry point: `node ai/training/arnesano/train.js`
 * (also `npm run ai:arnesano:train`).
 *
 * TARGET: 24-hour-ahead soil-moisture forecasting, from concurrent
 * weather/soil/irrigation state (see featureVersion.js). This is the
 * strongest legitimate target this dataset supports (see
 * AI_TARGET_CATALOG.md) — chosen because a leak-free, TRUE wall-clock
 * 24h horizon is directly constructible from the dataset's own
 * regular 10-minute grid (see buildExamples.js), unlike the dataset's
 * own published "24h" column (see AI_DATA_QUALITY_REPORT.md Finding
 * 1: that column is frequently NOT actually 24h ahead).
 *
 * DATASET ROLES (see AI_DATASET_INVENTORY.md / AI_TARGET_CATALOG.md
 * for full justification):
 *   - Zones 1, 2, 4 (open-field tomato x2, zucchini): PRIMARY TRAINING
 *     pool, pooled and split chronologically (train/validation/test).
 *   - Zone 5 (blueberry): held out ENTIRELY from training — evaluated
 *     with the trained model, unmodified, as a cross-crop
 *     "unseen experiment" validation (the closest analogue this single-
 *     season dataset supports to Evolving Tomato Testbed's 2024->2025
 *     cross-season check).
 *   - Zone 3 (potted tomato): REJECTED from any training/validation
 *     role — this project's own forensic audit found it has the worst
 *     sensor quality of any zone (a ~59-day soil-moisture flatline,
 *     the highest EC/pH sensor-error-code rate) — see
 *     AI_DATA_QUALITY_REPORT.md Finding 3.
 *
 * Honesty rules enforced here, not just documented:
 *  - The model is saved as 'candidate' unconditionally, promoted only
 *    if it clears a dual-condition gate (beats BOTH baselines, with a
 *    positive R^2, on BOTH the pooled test split AND the fully held-
 *    out zone-5 cross-crop validation) — never a default upgrade.
 *  - Zone 5's evaluation uses the model trained ONLY on zones 1/2/4,
 *    with NO retraining or fine-tuning on zone-5 data.
 */

const path = require('path');
const { load } = require('../../external/adapters/arnesanoCsvAdapter');
const { buildExamplesForZone } = require('./buildExamples');
const { trainRidgeRegression, predictRidgeRegression } = require('../tomato/linearRegression');
const { meanBaseline, persistenceBaseline } = require('./baseline');
const { evaluateRegressor } = require('../../evaluation/regressionMetrics');
const { saveModel, promoteModel, STATUS } = require('../../models/modelRegistry');
const { FEATURE_VERSION, FEATURE_NAMES, IRRIGATION_FEATURE_NAMES } = require('./featureVersion');
const { computeFeatureRanges, checkOutOfDistribution } = require('./outOfDistribution');

const TARGET = 'arnesano_soil_moisture_24h_forecast';
const PENDING_DIR = path.join(__dirname, '../../external/adapters/pending/arnesano/merged');
const TRAIN_ZONES = [1, 2, 4];
const CROSS_CROP_VALIDATION_ZONE = 5;
const REJECTED_ZONE = 3; // see file header

function toMatrix(examples, featureNames) {
  return examples.map((e) => featureNames.map((f) => e.features[f]));
}

function loadZone(zone) {
  const csvPath = path.join(PENDING_DIR, `dataset_zone_${zone}.csv`);
  const loadResult = load(csvPath, { zone });
  const { examples, skippedNoCurrentReading, skippedNoFutureReading, skippedGridGapAnomaly } = buildExamplesForZone(loadResult.records, { entityId: `arnesano-zone-${zone}` });
  return { loadResult, examples, skippedNoCurrentReading, skippedNoFutureReading, skippedGridGapAnomaly };
}

// trainRidgeRegression handles imputation + standardization internally
// and stores the fitted stats on the returned model; predictRidgeRegression
// reapplies those SAME train-fitted stats to any new (raw) rows — so
// callers pass raw (possibly-null) feature rows throughout, never
// pre-imputed/pre-standardized ones.
function fitAndEval(XTrainRaw, yTrain, XEvalRaw, yEval, { epochs = 500, learningRate = 0.05, l2 } = {}) {
  const model = trainRidgeRegression(XTrainRaw, yTrain, { epochs, learningRate, l2 });
  const pred = predictRidgeRegression(model, XEvalRaw);
  return { model, metrics: evaluateRegressor(yEval, pred) };
}

function run() {
  console.log('[arnesano/train] Loading training-pool zones', TRAIN_ZONES, 'and cross-crop validation zone', CROSS_CROP_VALIDATION_ZONE);

  const zoneData = {};
  for (const zone of [...TRAIN_ZONES, CROSS_CROP_VALIDATION_ZONE]) {
    zoneData[zone] = loadZone(zone);
    const zd = zoneData[zone];
    console.log(`[arnesano/train] zone ${zone}: totalRows=${zd.loadResult.totalRowsInFile} rejectedValues=${zd.loadResult.rejected.length} examples=${zd.examples.length} skipped(noCurrent=${zd.skippedNoCurrentReading}, noFuture=${zd.skippedNoFutureReading}, gapAnomaly=${zd.skippedGridGapAnomaly})`);
  }

  console.log(`[arnesano/train] Zone ${REJECTED_ZONE} deliberately excluded from all roles — see AI_DATA_QUALITY_REPORT.md Finding 3 (worst sensor quality of any zone).`);

  // Pool the training zones, sorted chronologically (valid: all zones
  // share the same real calendar/site, so a global time cut is a
  // legitimate chronological split, not a leak).
  let pooled = [];
  for (const zone of TRAIN_ZONES) pooled = pooled.concat(zoneData[zone].examples);
  pooled.sort((a, b) => a.asOf - b.asOf);
  console.log(`[arnesano/train] Pooled training examples (zones ${TRAIN_ZONES.join(',')}): ${pooled.length}`);

  const MIN_ROWS_FOR_TRAINING = 200;
  if (pooled.length < MIN_ROWS_FOR_TRAINING) {
    throw new Error(`[arnesano/train] Aborting: only ${pooled.length} usable examples, below MIN_ROWS_FOR_TRAINING=${MIN_ROWS_FOR_TRAINING}.`);
  }

  const n = pooled.length;
  const trainEnd = Math.floor(n * 0.7);
  const valEnd = Math.floor(n * 0.85);
  const train = pooled.slice(0, trainEnd);
  const validation = pooled.slice(trainEnd, valEnd);
  const test = pooled.slice(valEnd);
  console.log(`[arnesano/train] Chronological split: train=${train.length} (up to ${train[train.length - 1].asOf.toISOString()}), validation=${validation.length}, test=${test.length} (from ${test[0].asOf.toISOString()})`);

  const yTrain = train.map((e) => e.label);
  const yVal = validation.map((e) => e.label);
  const yTest = test.map((e) => e.label);
  const XTrain = toMatrix(train, FEATURE_NAMES);
  const XVal = toMatrix(validation, FEATURE_NAMES);
  const XTest = toMatrix(test, FEATURE_NAMES);

  const mb = meanBaseline(yTrain);
  const pb = persistenceBaseline();
  const mbTestMetrics = evaluateRegressor(yTest, mb.predict(test));
  const pbTestMetrics = evaluateRegressor(yTest, pb.predict(test));
  console.log('[arnesano/train] Mean baseline (test):', mbTestMetrics);
  console.log('[arnesano/train] Persistence baseline (test):', pbTestMetrics);

  const l2Candidates = [0.001, 0.01, 0.1, 1];
  let best = null;
  for (const l2 of l2Candidates) {
    const fitted = fitAndEval(XTrain, yTrain, XVal, yVal, { l2 });
    console.log(`[arnesano/train] l2=${l2} validation metrics:`, fitted.metrics);
    if (!best || fitted.metrics.r2 > best.metrics.r2) best = { l2, ...fitted };
  }

  const testPred = predictRidgeRegression(best.model, XTest);
  const testMetrics = evaluateRegressor(yTest, testPred);
  console.log(`[arnesano/train] Selected l2=${best.l2}. Test metrics:`, testMetrics);

  // Ablation: drop irrigation-related features entirely.
  const nonIrrigationFeatureNames = FEATURE_NAMES.filter((f) => !IRRIGATION_FEATURE_NAMES.includes(f));
  const XTrainAbl = toMatrix(train, nonIrrigationFeatureNames);
  const XValAbl = toMatrix(validation, nonIrrigationFeatureNames);
  const ablFitted = fitAndEval(XTrainAbl, yTrain, XValAbl, yVal, { l2: best.l2 });
  const XTestAbl = toMatrix(test, nonIrrigationFeatureNames);
  const ablTestMetrics = evaluateRegressor(yTest, predictRidgeRegression(ablFitted.model, XTestAbl));
  console.log('[arnesano/train] Ablation (no irrigation features) test metrics:', ablTestMetrics);

  // Cross-crop validation: zone 5 (blueberry), model trained ONLY on zones 1/2/4, NO retraining.
  const zone5Examples = zoneData[CROSS_CROP_VALIDATION_ZONE].examples;
  const yZone5 = zone5Examples.map((e) => e.label);
  const XZone5 = toMatrix(zone5Examples, FEATURE_NAMES);
  const zone5Pred = predictRidgeRegression(best.model, XZone5);
  const zone5Metrics = evaluateRegressor(yZone5, zone5Pred);
  const zone5MbMetrics = evaluateRegressor(yZone5, mb.predict(zone5Examples));
  const zone5PbMetrics = evaluateRegressor(yZone5, pb.predict(zone5Examples));
  console.log(`[arnesano/train] CROSS-CROP VALIDATION (zone ${CROSS_CROP_VALIDATION_ZONE}, blueberry, n=${zone5Examples.length}) — model metrics:`, zone5Metrics, 'mean baseline:', zone5MbMetrics, 'persistence baseline:', zone5PbMetrics);

  const trainingFeatureRanges = computeFeatureRanges(XTrain, FEATURE_NAMES);
  let zone5OodCount = 0;
  for (const ex of zone5Examples) {
    const { oodFeatures } = checkOutOfDistribution(ex.features, trainingFeatureRanges, FEATURE_NAMES);
    if (oodFeatures.length > 0) zone5OodCount += 1;
  }
  console.log(`[arnesano/train] Zone 5 OOD: ${zone5OodCount}/${zone5Examples.length} examples have >=1 feature outside the zones-1/2/4 training range.`);

  const beatsMeanTest = testMetrics.r2 > mbTestMetrics.r2;
  const beatsPersistenceTest = testMetrics.r2 > pbTestMetrics.r2;
  const positiveTestR2 = testMetrics.r2 > 0;
  const beatsMeanZone5 = zone5Metrics.r2 > zone5MbMetrics.r2;
  const beatsPersistenceZone5 = zone5Metrics.r2 > zone5PbMetrics.r2;
  const positiveZone5R2 = zone5Metrics.r2 > 0;
  const meetsValidationCriteria = beatsMeanTest && beatsPersistenceTest && positiveTestR2 && beatsMeanZone5 && beatsPersistenceZone5 && positiveZone5R2;
  console.log('[arnesano/train] Dual-condition validation gate:', { beatsMeanTest, beatsPersistenceTest, positiveTestR2, beatsMeanZone5, beatsPersistenceZone5, positiveZone5R2, meetsValidationCriteria });

  const record = saveModel({
    target: TARGET,
    modelType: 'ridge_linear_regression',
    featureVersion: FEATURE_VERSION,
    dataSource: 'external',
    datasetIds: TRAIN_ZONES.map((z) => `arnesano-precision-irrigation-zone-${z}`),
    evaluationMethod: 'chronological-split-zones-1-2-4-plus-cross-crop-validation-zone-5',
    datasetRange: { from: train[0].asOf.toISOString(), to: test[test.length - 1].asOf.toISOString(), sampleCount: pooled.length },
    metrics: testMetrics,
    baselineMetrics: {
      meanBaseline: mbTestMetrics,
      persistenceBaseline: pbTestMetrics,
      ablationNoIrrigationFeatures: ablTestMetrics,
      crossCropValidationZone5: { model: zone5Metrics, meanBaseline: zone5MbMetrics, persistenceBaseline: zone5PbMetrics, oodFraction: zone5Examples.length ? zone5OodCount / zone5Examples.length : null },
    },
    modelParams: { ...best.model, trainingFeatureRanges },
    status: STATUS.CANDIDATE,
  });
  console.log(`[arnesano/train] Saved model ${record.modelName} v${record.version} as status="${record.status}".`);

  if (meetsValidationCriteria) {
    const promoted = promoteModel(TARGET, record.version, STATUS.VALIDATED);
    console.log(`[arnesano/train] Validation criteria met — promoted to status="${promoted.status}".`);
  } else {
    console.log('[arnesano/train] Validation criteria NOT met — model remains "candidate" and will NOT be served by the inference API. See AI_TRAINING_REPORT.md.');
  }

  return {
    testMetrics,
    baselineMetrics: { meanBaseline: mbTestMetrics, persistenceBaseline: pbTestMetrics },
    ablationTestMetrics: ablTestMetrics,
    zone5Metrics,
    zone5Baselines: { meanBaseline: zone5MbMetrics, persistenceBaseline: zone5PbMetrics },
    zone5OodCount,
    zone5ExampleCount: zone5Examples.length,
    meetsValidationCriteria,
    modelRecord: record,
    featureNames: FEATURE_NAMES,
  };
}

if (require.main === module) {
  try {
    const result = run();
    console.log('\n[arnesano/train] DONE.');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('[arnesano/train] FAILED:', err.message, err.stack);
    process.exitCode = 1;
  }
}

module.exports = { run, TARGET, TRAIN_ZONES, CROSS_CROP_VALIDATION_ZONE, REJECTED_ZONE, toMatrix };
