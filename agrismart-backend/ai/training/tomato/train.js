'use strict';

/**
 * ai/training/tomato/train.js
 *
 * Real-data training pipeline for the Mendeley "Dataset on irrigation
 * for Tomato" (DOI 10.17632/33cngpcrmx.2). CLI entry point:
 *   node ai/training/tomato/train.js
 * (also wired as `npm run ai:tomato:train`).
 *
 * Target: soilMoistureRaw (a virtual-sensor / concurrent-estimation
 * regression — predicting the CURRENT soil-moisture reading from
 * other CURRENT concurrent environmental/agronomic measurements).
 * This dataset does NOT contain any irrigation decision, valve
 * state, or pump signal, so no irrigation-control label is invented
 * — see AI_TRAINING_REPORT.md for the full target-selection
 * rationale.
 *
 * Honesty rules enforced here, not just documented:
 *  - Exact-duplicate rows are dropped before splitting (never left in
 *    to inflate apparent sample count or bias a split).
 *  - The split is GROUP-aware by daysSincePlanting (see
 *    splitByPlantingDay.js) specifically to prevent same-day
 *    near-duplicate readings leaking across train/test.
 *  - assertNoOverlapBetweenSplits is called and allowed to throw
 *    uncaught — a real leakage bug here must stop the run, not be
 *    logged and ignored.
 *  - The model is saved as 'candidate' unconditionally. It is only
 *    promoted to 'validated' if it clears BOTH baselines on the TEST
 *    split with a positive R² — never a default upgrade.
 */

const path = require('path');
const { load } = require('../../external/adapters/tomatoIrrigationCsvAdapter');
const { runTabularQualityChecks } = require('../../external/quality/tabularQualityEngine');
const { assertNoOverlapBetweenSplits } = require('../../external/leakage/leakageGuards');
const { splitByPlantingDay } = require('./splitByPlantingDay');
const { buildFeatureMatrix } = require('./features');
const { trainRidgeRegression, predictRidgeRegression } = require('./linearRegression');
const { meanBaseline, stageMeanBaseline } = require('./baseline');
const { evaluateRegressor } = require('../../evaluation/regressionMetrics');
const { saveModel, promoteModel, STATUS } = require('../../models/modelRegistry');
const { FEATURE_VERSION, FEATURE_NAMES } = require('./featureVersion');
const { computeFeatureRanges } = require('./outOfDistribution');

const TARGET = 'tomato_soil_moisture_estimate';
const DATASET_CSV_PATH = path.join(__dirname, '../../external/adapters/pending/tomato_irrigation_dataset.csv');

function dedupeExactRows(records) {
  const seen = new Set();
  const deduped = [];
  let removed = 0;
  for (const r of records) {
    // Signature over everything except rowIndex/_duplicateOfEarlierRow (position-independent content match).
    const { rowIndex: _rowIndex, _duplicateOfEarlierRow, ...content } = r;
    const sig = JSON.stringify(content);
    if (seen.has(sig)) {
      removed += 1;
      continue;
    }
    seen.add(sig);
    deduped.push(r);
  }
  return { deduped, removed };
}

function run() {
  console.log(`[tomato/train] Loading real dataset from ${DATASET_CSV_PATH}`);
  const loadResult = load(DATASET_CSV_PATH);
  console.log(`[tomato/train] provenance.ingested=${loadResult.provenance.ingested} totalRowsInFile=${loadResult.totalRowsInFile} accepted=${loadResult.records.length} rejected=${loadResult.rejected.length}`);
  if (loadResult.rejected.length > 0) {
    console.log('[tomato/train] REJECTED ROWS (first 5):', JSON.stringify(loadResult.rejected.slice(0, 5), null, 2));
  }

  const { deduped, removed } = dedupeExactRows(loadResult.records);
  console.log(`[tomato/train] Dropped ${removed} exact-duplicate row(s); ${deduped.length} rows remain.`);

  const quality = runTabularQualityChecks(deduped, { duplicateRowCount: loadResult.duplicateRowCount });
  console.log('[tomato/train] Quality findings:', JSON.stringify(quality.findings.filter((f) => f.level !== 'INFO'), null, 2));

  const errorFindings = quality.findings.filter((f) => f.level === 'ERROR' || f.level === 'CRITICAL');
  if (errorFindings.length > 0) {
    throw new Error(`[tomato/train] Aborting: ${errorFindings.length} ERROR/CRITICAL quality finding(s). ${JSON.stringify(errorFindings)}`);
  }

  const MIN_ROWS_FOR_TRAINING = 200;
  if (deduped.length < MIN_ROWS_FOR_TRAINING) {
    throw new Error(`[tomato/train] Aborting: only ${deduped.length} usable rows, below MIN_ROWS_FOR_TRAINING=${MIN_ROWS_FOR_TRAINING}. This dataset would be DATA INSUFFICIENT for training.`);
  }

  const { train, validation, test, trainEndDay, valEndDay } = splitByPlantingDay(deduped, { trainFraction: 0.7, valFraction: 0.15 });
  console.log(`[tomato/train] Split by planting-day groups: train=${train.length} (days<=${trainEndDay}), validation=${validation.length} (days<=${valEndDay}), test=${test.length} (days>${valEndDay})`);

  // Fail loud if any leakage slipped through: same (trialId, daysSincePlanting) pair
  // must never appear on both sides, and train's day range must be strictly
  // before test's day range. daysSincePlanting is an ORDINAL day count, not a
  // real timestamp, but it is used here purely as a monotonic ordering key —
  // see splitByPlantingDay.js's own comment.
  assertNoOverlapBetweenSplits(train, test, { timestampKey: 'daysSincePlanting', entityKey: 'trialId', requireChronological: true });
  assertNoOverlapBetweenSplits(train, validation, { timestampKey: 'daysSincePlanting', entityKey: 'trialId', requireChronological: true });
  assertNoOverlapBetweenSplits(validation, test, { timestampKey: 'daysSincePlanting', entityKey: 'trialId', requireChronological: true });
  console.log('[tomato/train] Leakage guard passed: no (trialId, daysSincePlanting) pair shared across splits, and split day-ranges are strictly ordered train < validation < test.');

  const { X: XTrain, y: yTrain } = buildFeatureMatrix(train);
  const { X: XVal, y: yVal } = buildFeatureMatrix(validation);
  const { X: XTest, y: yTest } = buildFeatureMatrix(test);

  // Baselines.
  const mb = meanBaseline(yTrain);
  const smb = stageMeanBaseline(train, yTrain);
  const mbTestMetrics = evaluateRegressor(yTest, mb.predict(test));
  const smbTestMetrics = evaluateRegressor(yTest, smb.predict(test));
  console.log('[tomato/train] Mean baseline (test):', mbTestMetrics);
  console.log('[tomato/train] Stage-mean baseline (test):', smbTestMetrics);

  // Model: try a couple of L2 values, pick the best on VALIDATION (never test).
  const l2Candidates = [0.001, 0.01, 0.1, 1];
  let best = null;
  for (const l2 of l2Candidates) {
    const model = trainRidgeRegression(XTrain, yTrain, { epochs: 800, learningRate: 0.05, l2 });
    const valMetrics = evaluateRegressor(yVal, predictRidgeRegression(model, XVal));
    console.log(`[tomato/train] l2=${l2} validation metrics:`, valMetrics);
    if (!best || valMetrics.r2 > best.valMetrics.r2) {
      best = { l2, model, valMetrics };
    }
  }

  const testPred = predictRidgeRegression(best.model, XTest);
  const testMetrics = evaluateRegressor(yTest, testPred);
  console.log(`[tomato/train] Selected l2=${best.l2}. Test metrics:`, testMetrics);

  const beatsMeanBaseline = testMetrics.r2 > mbTestMetrics.r2;
  const beatsStageMeanBaseline = testMetrics.r2 > smbTestMetrics.r2;
  const positiveR2 = testMetrics.r2 > 0;
  const meetsValidationCriteria = beatsMeanBaseline && beatsStageMeanBaseline && positiveR2;

  console.log('[tomato/train] Validation criteria:', { beatsMeanBaseline, beatsStageMeanBaseline, positiveR2, meetsValidationCriteria });

  const record = saveModel({
    target: TARGET,
    modelType: 'ridge_linear_regression',
    featureVersion: FEATURE_VERSION,
    dataSource: 'external',
    datasetIds: [loadResult.provenance.datasetId],
    evaluationMethod: 'grouped-chronological-split-by-planting-day',
    datasetRange: { from: null, to: null, sampleCount: deduped.length },
    metrics: testMetrics,
    baselineMetrics: { meanBaseline: mbTestMetrics, stageMeanBaseline: smbTestMetrics },
    modelParams: { ...best.model, trainingFeatureRanges: computeFeatureRanges(XTrain, FEATURE_NAMES) },
    status: STATUS.CANDIDATE, // never anything else at save time — see modelRegistry.js
  });
  console.log(`[tomato/train] Saved model ${record.modelName} v${record.version} as status="${record.status}".`);

  if (meetsValidationCriteria) {
    const promoted = promoteModel(TARGET, record.version, STATUS.VALIDATED);
    console.log(`[tomato/train] Validation criteria met — promoted to status="${promoted.status}".`);
  } else {
    console.log('[tomato/train] Validation criteria NOT met — model remains "candidate" and will NOT be served by the inference API. See AI_TRAINING_REPORT.md.');
  }

  return {
    provenance: loadResult.provenance,
    totalRowsInFile: loadResult.totalRowsInFile,
    duplicatesRemoved: removed,
    quality,
    split: { trainCount: train.length, validationCount: validation.length, testCount: test.length, trainEndDay, valEndDay },
    baselineMetrics: { meanBaseline: mbTestMetrics, stageMeanBaseline: smbTestMetrics },
    selectedL2: best.l2,
    testMetrics,
    meetsValidationCriteria,
    modelRecord: record,
    featureNames: FEATURE_NAMES,
  };
}

if (require.main === module) {
  try {
    const result = run();
    console.log('\n[tomato/train] DONE.');
    console.log(JSON.stringify({ ...result, quality: undefined }, null, 2));
  } catch (err) {
    console.error('[tomato/train] FAILED:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { run, dedupeExactRows, TARGET };
