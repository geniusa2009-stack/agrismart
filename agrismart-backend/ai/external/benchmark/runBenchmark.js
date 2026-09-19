'use strict';

/**
 * ai/external/benchmark/runBenchmark.js
 *
 * Runs the irrigation-need-prediction benchmark (the same task
 * definition as ai/training/train.js) against ANY dataset in
 * datasetRegistry.js — external fixtures, AgriSmart synthetic-dev, or
 * (once real telemetry exists) AgriSmart real data via ai/data.
 *
 * Every run: loads -> quality report -> builds examples (reusing
 * ai/data/datasetBuilder + ai/features, so leakage discipline is
 * identical to the first AI workstream) -> asserts no train/test
 * overlap (leakageGuards, THROWS if violated) -> trains logistic
 * regression + both baselines -> evaluates -> writes a JSON report to
 * ai/external/reports/.
 *
 * Honesty gate: the written report's `resultsAreTransferable` field is
 * `false` whenever the dataset's provenance has `ingested: false` — no
 * report emitted by this file can be read as "validated on real
 * external data" unless that flag is genuinely true.
 */

const fs = require('fs');
const path = require('path');

const { loadDataset } = require('./datasetRegistry');
const { bridgeToAgriSmartShape } = require('./canonicalBridge');
const { runQualityChecks } = require('../quality/qualityEngine');
const { assertNoOverlapBetweenSplits, scanForSuspiciousLabelCorrelation } = require('../leakage/leakageGuards');
const { buildExamplesForDevice } = require('../../data/datasetBuilder');
const { splitChronological } = require('../../training/splitChronological');
const { trainLogisticRegression, predictProbaLogisticRegression } = require('../../training/logisticRegression');
const { persistenceBaselinePredict, trendBaselinePredict } = require('../../training/baseline');
const { evaluateBinaryClassifier } = require('../../evaluation/metrics');
const { FEATURE_NAMES, FEATURE_VERSION } = require('../../features/featureVersion');
const { logExperiment } = require('../experiments/experimentLog');

const REPORTS_DIR = path.join(__dirname, '../reports');
const MIN_EXAMPLES_FOR_BENCHMARK = 30; // deliberately low so tiny fixtures still exercise the pipeline honestly as "insufficient" rather than crashing
const DEFAULT_THRESHOLD_PERCENT = 30;

function toMatrix(examples) {
  return examples.map((ex) => FEATURE_NAMES.map((name) => ex.features[name]));
}

function runBenchmarkForDataset(datasetId) {
  const dataset = loadDataset(datasetId);
  const { provenance, records, rejected } = dataset;

  const bridged = bridgeToAgriSmartShape(records);
  // Some datasets (e.g. AgriSmart synthetic-dev loaded via the registry
  // wrapper) attach real irrigation events out-of-band rather than
  // deriving them from a per-row irrigationState flag.
  if (records.__irrigationEvents && bridged.length === 1) {
    bridged[0].irrigationHistory = records.__irrigationEvents;
  }

  let allExamples = [];
  const qualityReports = {};
  for (const entity of bridged) {
    qualityReports[entity.entityId] = runQualityChecks(
      entity.telemetryHistory.map((t) => ({ timestamp: t.recordedAt, soilMoisture: t.readings.soilMoisturePercent, soilTemperature: t.readings.temperatureCelsius, fieldId: entity.entityId, soilEc: null, soilSalinity: t.readings.soilSalinityPpt, airTemperature: null, relativeHumidity: null, precipitation: null, irrigationDurationSeconds: null })),
      {}
    );

    const { examples } = buildExamplesForDevice({
      deviceId: entity.entityId,
      valveId: entity.entityId,
      farmId: 'external-benchmark',
      telemetryHistory: entity.telemetryHistory,
      irrigationHistory: entity.irrigationHistory,
      thresholdPercent: DEFAULT_THRESHOLD_PERCENT,
    });
    allExamples = allExamples.concat(examples);
  }
  allExamples.sort((a, b) => a.asOf - b.asOf);

  const result = {
    datasetId,
    provenance,
    rejectedRecordCount: rejected.length,
    qualityReports,
    exampleCount: allExamples.length,
    resultsAreTransferable: false, // set true below ONLY if provenance.ingested is genuinely true
    generatedAt: new Date().toISOString(),
  };

  if (allExamples.length < MIN_EXAMPLES_FOR_BENCHMARK) {
    result.status = 'INSUFFICIENT_DATA';
    result.reason = `Only ${allExamples.length} labeled examples derivable from this dataset (minimum ${MIN_EXAMPLES_FOR_BENCHMARK} for even a smoke-test benchmark). This is an honest, expected result for a small structural fixture — see ai/external/README.md.`;
    return result;
  }

  const { train, validation, test } = splitChronological(allExamples);

  if (train.length < 10 || test.length < 5) {
    result.status = 'INSUFFICIENT_SPLIT';
    result.reason = `Chronological split produced train=${train.length}, test=${test.length} — too small past the split to evaluate meaningfully.`;
    return result;
  }

  // FAIL LOUD on any temporal leakage between splits — this is not
  // caught-and-logged, a thrown LeakageError propagates out of this
  // function and aborts the benchmark run for this dataset.
  assertNoOverlapBetweenSplits(train, test, { timestampKey: 'asOf', entityKey: 'deviceId' });

  const XTrain = toMatrix(train);
  const yTrain = train.map((e) => e.label);
  const XTest = toMatrix(test);
  const yTest = test.map((e) => e.label);

  const suspiciousFeatures = scanForSuspiciousLabelCorrelation(XTrain, yTrain, FEATURE_NAMES);

  const model = trainLogisticRegression(XTrain, yTrain, { epochs: 300, learningRate: 0.15, l2: 0.01 });
  const testScores = predictProbaLogisticRegression(model, XTest);
  const testPreds = testScores.map((p) => (p >= 0.5 ? 1 : 0));
  const modelMetrics = evaluateBinaryClassifier(yTest, testPreds, testScores);

  const persistenceMetrics = evaluateBinaryClassifier(yTest, test.map(() => persistenceBaselinePredict()), null);
  const trendMetrics = evaluateBinaryClassifier(yTest, test.map((ex) => trendBaselinePredict(ex.features, DEFAULT_THRESHOLD_PERCENT)), null);

  result.status = 'COMPLETED';
  result.featureVersion = FEATURE_VERSION;
  result.split = { train: train.length, validation: validation.length, test: test.length };
  result.suspiciousLabelCorrelatedFeatures = suspiciousFeatures;
  result.metrics = { model: modelMetrics, persistenceBaseline: persistenceMetrics, trendBaseline: trendMetrics };
  result.beatsPersistence = modelMetrics.f1 !== null && (persistenceMetrics.f1 === null || modelMetrics.f1 > persistenceMetrics.f1);
  result.beatsTrend = modelMetrics.f1 !== null && trendMetrics.f1 !== null && modelMetrics.f1 > trendMetrics.f1;
  // The ONLY line in this file allowed to flip this to true.
  result.resultsAreTransferable = provenance.ingested === true;
  if (!result.resultsAreTransferable) {
    result.transferabilityNote = `provenance.ingested=false for dataset "${datasetId}" — this dataset was never downloaded/verified as real (see ai/external/README.md). Metrics above prove the BENCHMARK PIPELINE runs correctly end-to-end; they say nothing about real-world generalization.`;
  }

  logExperiment({
    hypothesis: `Logistic regression irrigation-need model beats persistence/trend baselines on dataset "${datasetId}".`,
    datasetId,
    features: FEATURE_NAMES,
    target: 'irrigation_need_next_3h',
    split: result.split,
    model: 'logistic_regression',
    parameters: { epochs: 300, learningRate: 0.15, l2: 0.01 },
    metrics: result.metrics,
    conclusion: result.resultsAreTransferable
      ? (result.beatsPersistence && result.beatsTrend ? 'Model beat both baselines on REAL ingested data.' : 'Model did NOT clearly beat baselines on real ingested data.')
      : 'Not a validity claim — dataset not ingested (fixture-only); pipeline-correctness result only.',
  });

  return result;
}

function main() {
  const datasetId = process.argv[2] || process.env.BENCH_DATASET;
  if (!datasetId) {
    console.error('Usage: npm run bench:run -- --dataset=<id>  (or set BENCH_DATASET)');
    console.error('Known datasets:', require('./datasetRegistry').listDatasets());
    process.exit(1);
  }
  const cleanId = datasetId.replace(/^--dataset=/, '');
  const result = runBenchmarkForDataset(cleanId);

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const outPath = path.join(REPORTS_DIR, `${cleanId}.benchmark.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log(`=== Benchmark: ${cleanId} ===`);
  console.log(`Status: ${result.status}`);
  if (result.reason) console.log(`Reason: ${result.reason}`);
  if (result.metrics) console.log('Metrics:', JSON.stringify(result.metrics, null, 2));
  console.log(`resultsAreTransferable: ${result.resultsAreTransferable}`);
  if (result.transferabilityNote) console.log(`Note: ${result.transferabilityNote}`);
  console.log(`Full report written to ${outPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`Benchmark run failed: ${err.name || 'Error'}: ${err.message}`);
    if (err.details) console.error('Details:', JSON.stringify(err.details, null, 2));
    process.exit(1);
  }
}

module.exports = { runBenchmarkForDataset };
