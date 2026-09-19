'use strict';

/**
 * ai/training/evolvingTomato/train.js
 *
 * Real-data training pipeline for the "IoT Dataset from an Evolving
 * Tomato Cultivation Testbed" (2023/2024/2025 seasons; see
 * ai/external/adapters/evolvingTomatoCsvAdapter.js for provenance).
 * CLI: `node ai/training/evolvingTomato/train.js` / `npm run
 * ai:evolvingTomato:train`.
 *
 * Target: 'irrigation_event_next_1h' — will a REAL valve open (per
 * this dataset's own valve-controller ground truth) within the next
 * hour, given features computed the SAME way as workstream 1's
 * irrigation_need_next_3h model (ai/features/featureEngineering.js,
 * completely unchanged). This is a DIFFERENT, independently-registered
 * target from irrigation_need_next_3h — never confused or merged with
 * it (that model's label is a soil-moisture-threshold rule; this
 * model's label is a real observed valve-actuation event).
 *
 * PRIMARY TRAINING: 2024 season (chronological train/validation/test
 * split within the season).
 * EXTERNAL VALIDATION: 2025 season (an entirely separate, later,
 * unseen year at the same site) — the 2024-trained model is applied
 * AS-IS, with NO retraining, to every 2025 example.
 *
 * Ablation: the same model architecture is also trained with the
 * irrigation-history features (hoursSinceLastIrrigation,
 * irrigationMinutesLast6h/24h) blanked out, to determine whether
 * real predictive value survives without them (see
 * AI_ABLATION_REPORT.md for the full writeup — this script prints the
 * raw numbers it is built from).
 */

const path = require('path');
const { load } = require('../../external/adapters/evolvingTomatoCsvAdapter');
const { bridgeToAgriSmartShape } = require('../../external/benchmark/canonicalBridge');
const { buildDatasetFromBridged } = require('./buildExamples');
const { splitChronological } = require('../splitChronological');
const { trainLogisticRegression, predictProbaLogisticRegression } = require('../logisticRegression');
const { evaluateBinaryClassifier } = require('../../evaluation/metrics');
const { computeFeatureRanges, checkOutOfDistribution } = require('../../inference/outOfDistribution');
const { saveModel, promoteModel, STATUS } = require('../../models/modelRegistry');
const { FEATURE_VERSION, FEATURE_NAMES } = require('../../features/featureVersion');

const TARGET = 'irrigation_event_next_1h';
const IRRIGATION_HISTORY_FEATURE_NAMES = ['hoursSinceLastIrrigation', 'irrigationMinutesLast6h', 'irrigationMinutesLast24h'];
const DATA_ROOT = path.join(__dirname, '../../external/adapters/pending/evolving-tomato-testbed');

function toMatrix(examples, { blankIrrigationHistory = false } = {}) {
  const irrigIdx = IRRIGATION_HISTORY_FEATURE_NAMES.map((n) => FEATURE_NAMES.indexOf(n));
  return examples.map((e) =>
    FEATURE_NAMES.map((name, idx) => {
      if (blankIrrigationHistory && irrigIdx.includes(idx)) return null;
      const v = e.features[name];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    })
  );
}

function baseRatePredict(trainY) {
  const rate = trainY.reduce((a, b) => a + b, 0) / trainY.length;
  return { rate, predictProba: (n) => new Array(n).fill(rate) };
}

function loadSeason(year, soilFileName, valveFileName) {
  const seasonDir = path.join(DATA_ROOT, String(year));
  const loadResult = load(seasonDir, { year, soilFileName, valveFileName });
  const bridged = bridgeToAgriSmartShape(loadResult.records);
  const { examples, readiness } = buildDatasetFromBridged(bridged);
  return { loadResult, bridged, examples, readiness };
}

function evalAt(name, yTrue, yProba, threshold = 0.5) {
  const yPred = yProba.map((p) => (p >= threshold ? 1 : 0));
  const metrics = evaluateBinaryClassifier(yTrue, yPred, yProba);
  console.log(`[evolvingTomato/train] ${name}:`, JSON.stringify(metrics));
  return metrics;
}

function run() {
  console.log('[evolvingTomato/train] Loading PRIMARY TRAINING season: 2024');
  const season2024 = loadSeason(2024, 'soil2024.csv', 'valve_controller2024.csv');
  console.log(`[evolvingTomato/train] 2024: ${season2024.loadResult.totalRowsInFile} raw rows, ${season2024.loadResult.records.length} accepted, ${season2024.loadResult.rejected.length} rejected, ${season2024.examples.length} labeled examples, positive rate=${season2024.readiness.classBalance}`);

  const MIN_EXAMPLES = 500;
  if (season2024.examples.length < MIN_EXAMPLES) {
    throw new Error(`[evolvingTomato/train] Aborting: only ${season2024.examples.length} examples, below MIN_EXAMPLES=${MIN_EXAMPLES}.`);
  }

  const { train, validation, test } = splitChronological(season2024.examples, { trainFraction: 0.7, valFraction: 0.15 });
  console.log(`[evolvingTomato/train] 2024 split: train=${train.length} validation=${validation.length} test=${test.length}`);
  console.log(`[evolvingTomato/train] train period: ${train[0].asOf.toISOString()} .. ${train[train.length - 1].asOf.toISOString()}`);
  console.log(`[evolvingTomato/train] test period: ${test[0].asOf.toISOString()} .. ${test[test.length - 1].asOf.toISOString()}`);

  const yTrain = train.map((e) => e.label);
  const yVal = validation.map((e) => e.label);
  const yTest = test.map((e) => e.label);

  // Baseline: base rate (equivalent to "predict the training positive rate for every example").
  const baseline = baseRatePredict(yTrain);
  console.log('[evolvingTomato/train] Baseline (predict train base rate):');
  evalAt('baseline/test', yTest, baseline.predictProba(yTest.length));

  // Primary model: full feature set.
  const XTrain = toMatrix(train);
  const XVal = toMatrix(validation);
  const XTest = toMatrix(test);

  const l2Candidates = [0.001, 0.01, 0.1, 1];
  let best = null;
  for (const l2 of l2Candidates) {
    const model = trainLogisticRegression(XTrain, yTrain, { epochs: 300, learningRate: 0.3, l2 });
    const probaVal = predictProbaLogisticRegression(model, XVal);
    const m = evalAt(`l2=${l2} validation`, yVal, probaVal);
    if (!best || (m.averagePrecision || 0) > (best.metrics.averagePrecision || 0)) {
      best = { l2, model, metrics: m };
    }
  }
  console.log(`[evolvingTomato/train] Selected l2=${best.l2} by validation averagePrecision.`);

  const probaTest = predictProbaLogisticRegression(best.model, XTest);
  const testMetrics = evalAt('PRIMARY MODEL — 2024 test (in-season, full features)', yTest, probaTest);

  // Ablation: same architecture, irrigation-history features blanked.
  const XTrainNoHist = toMatrix(train, { blankIrrigationHistory: true });
  const XValNoHist = toMatrix(validation, { blankIrrigationHistory: true });
  const XTestNoHist = toMatrix(test, { blankIrrigationHistory: true });
  const modelNoHist = trainLogisticRegression(XTrainNoHist, yTrain, { epochs: 300, learningRate: 0.3, l2: best.l2 });
  const probaTestNoHist = predictProbaLogisticRegression(modelNoHist, XTestNoHist);
  const ablationMetrics = evalAt('ABLATION — 2024 test (irrigation-history features blanked)', yTest, probaTestNoHist);
  void XValNoHist; // computed for symmetry with the primary path; not separately reported

  // Out-of-distribution ranges from TRAIN only.
  const trainingFeatureRanges = computeFeatureRanges(XTrain);

  // EXTERNAL VALIDATION: 2025 season, model trained on 2024 applied with NO retraining.
  console.log('[evolvingTomato/train] Loading EXTERNAL VALIDATION season: 2025 (no retraining — same 2024-trained model)');
  const season2025 = loadSeason(2025, 'soil2025.csv', 'valve_controller2025.csv');
  console.log(`[evolvingTomato/train] 2025: ${season2025.loadResult.totalRowsInFile} raw rows, ${season2025.loadResult.records.length} accepted, ${season2025.loadResult.rejected.length} rejected, ${season2025.examples.length} labeled examples, positive rate=${season2025.readiness.classBalance}`);

  const y2025 = season2025.examples.map((e) => e.label);
  const X2025 = toMatrix(season2025.examples);
  const proba2025 = predictProbaLogisticRegression(best.model, X2025);
  const externalMetrics = evalAt('EXTERNAL VALIDATION — full 2025 season (2024-trained model, no retraining)', y2025, proba2025);

  let oodCount2025 = 0;
  for (const ex of season2025.examples) {
    const { oodFeatures } = checkOutOfDistribution(ex.features, trainingFeatureRanges);
    if (oodFeatures.length >= 3) oodCount2025 += 1;
  }
  console.log(`[evolvingTomato/train] 2025 examples flagged out-of-distribution (>=3 features beyond 2024 training range): ${oodCount2025}/${season2025.examples.length}`);

  // Validation criteria: must clear the base-rate baseline meaningfully on BOTH
  // the in-season 2024 test AND the fully external 2025 season (no retraining) —
  // a stricter bar than a single in-season test, on purpose.
  const baseRate2024 = baseline.rate;
  const baseRate2025 = y2025.reduce((a, b) => a + b, 0) / y2025.length;
  const meetsValidationCriteria =
    (testMetrics.averagePrecision || 0) > 3 * baseRate2024 &&
    testMetrics.rocAuc !== null && testMetrics.rocAuc > 0.75 &&
    (externalMetrics.averagePrecision || 0) > 3 * baseRate2025 &&
    externalMetrics.rocAuc !== null && externalMetrics.rocAuc > 0.75;

  console.log('[evolvingTomato/train] Validation criteria:', JSON.stringify({
    testAvgPrecisionOverBaseRate: testMetrics.averagePrecision / baseRate2024,
    testRocAuc: testMetrics.rocAuc,
    externalAvgPrecisionOverBaseRate: externalMetrics.averagePrecision / baseRate2025,
    externalRocAuc: externalMetrics.rocAuc,
    meetsValidationCriteria,
  }));

  const record = saveModel({
    target: TARGET,
    modelType: 'logistic_regression',
    featureVersion: FEATURE_VERSION,
    dataSource: 'external',
    datasetIds: [season2024.loadResult.provenance.datasetId, season2025.loadResult.provenance.datasetId],
    evaluationMethod: 'chronological-split-2024-plus-external-2025-season-validation',
    datasetRange: { from: train[0].asOf, to: test[test.length - 1].asOf, sampleCount: season2024.examples.length },
    metrics: testMetrics,
    baselineMetrics: { baseRate2024, ablationWithoutIrrigationHistory: ablationMetrics, externalValidation2025: externalMetrics, baseRate2025 },
    modelParams: { ...best.model, trainingFeatureRanges },
    status: STATUS.CANDIDATE,
  });
  console.log(`[evolvingTomato/train] Saved model ${record.modelName} v${record.version} as status="${record.status}".`);

  if (meetsValidationCriteria) {
    const promoted = promoteModel(TARGET, record.version, STATUS.VALIDATED);
    console.log(`[evolvingTomato/train] Validation criteria met (in-season AND external) — promoted to status="${promoted.status}".`);
  } else {
    console.log('[evolvingTomato/train] Validation criteria NOT met on at least one of {in-season test, external 2025} — model remains "candidate".');
  }

  return {
    season2024: { readiness: season2024.readiness, split: { train: train.length, validation: validation.length, test: test.length } },
    season2025: { readiness: season2025.readiness },
    baseRate2024,
    baseRate2025,
    selectedL2: best.l2,
    testMetrics,
    ablationMetrics,
    externalMetrics,
    oodCount2025,
    meetsValidationCriteria,
    modelRecord: record,
  };
}

if (require.main === module) {
  try {
    const result = run();
    console.log('\n[evolvingTomato/train] DONE.');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('[evolvingTomato/train] FAILED:', err.message, err.stack);
    process.exitCode = 1;
  }
}

module.exports = { run, TARGET, toMatrix, IRRIGATION_HISTORY_FEATURE_NAMES };
