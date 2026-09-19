'use strict';

/**
 * ai/training/train.js
 *
 * Orchestrates one full training run: load data (real, best-effort) ->
 * fall back to synthetic-dev if insufficient -> build dataset ->
 * chronological split -> train baselines + logistic regression ->
 * evaluate -> save versioned artifact.
 *
 * MIN_REAL_EXAMPLES is the minimum labeled example count this pipeline
 * considers even worth attempting real training with. Below that, it
 * refuses to call the result anything but synthetic-dev, no matter how
 * the metrics look — a small real dataset producing a good-looking
 * score is exactly the kind of misleading result spec section 19
 * ("no fake AI") forbids presenting as validated.
 */

const { loadRealDataset } = require('../data/telemetryLoader');
const { generateSyntheticDevDataset } = require('../data/syntheticDevData');
const { buildDataset } = require('../data/datasetBuilder');
const { splitChronological } = require('../training/splitChronological');
const { trainLogisticRegression, predictProbaLogisticRegression } = require('./logisticRegression');
const { persistenceBaselinePredict, trendBaselinePredict } = require('./baseline');
const { evaluateBinaryClassifier } = require('../evaluation/metrics');
const { saveModel } = require('../models/modelRegistry');
const { computeFeatureRanges } = require('../inference/outOfDistribution');
const { FEATURE_VERSION, FEATURE_NAMES } = require('../features/featureVersion');

const MIN_REAL_EXAMPLES = 500;
const TARGET = 'irrigation_need_next_3h';
const DEFAULT_THRESHOLD = 30;

function toMatrix(examples) {
  return examples.map((ex) => FEATURE_NAMES.map((name) => ex.features[name]));
}

function toLabels(examples) {
  return examples.map((ex) => ex.label);
}

async function assembleDataset() {
  const real = await loadRealDataset();
  if (real.ok && real.counts.telemetryReadings > 0) {
    const { examples, readiness } = buildDataset({
      valves: real.valves,
      telemetryByDevice: real.telemetryByDevice,
      irrigationByValve: real.irrigationByValve,
    });
    if (examples.length >= MIN_REAL_EXAMPLES) {
      return { examples, readiness, dataSource: 'real' };
    }
    return {
      examples,
      readiness,
      dataSource: 'real-insufficient',
      note: `Only ${examples.length} real labeled examples available (minimum ${MIN_REAL_EXAMPLES} required for a trustworthy split). Falling back to synthetic-dev data for pipeline verification.`,
    };
  }

  const synthetic = generateSyntheticDevDataset({ days: 45, intervalMinutes: 15, autoOpenBelowPercent: DEFAULT_THRESHOLD });
  const fakeValve = {
    deviceId: synthetic.meta.deviceId,
    _id: 'synthetic-dev-valve',
    farmId: 'synthetic-dev-farm',
    autoOpenBelowPercent: DEFAULT_THRESHOLD,
  };
  const { examples, readiness } = buildDataset({
    valves: [fakeValve],
    telemetryByDevice: new Map([[synthetic.meta.deviceId, synthetic.telemetry]]),
    irrigationByValve: new Map([[String(fakeValve._id), synthetic.irrigationEvents]]),
  });
  return { examples, readiness, dataSource: 'synthetic-dev', syntheticMeta: synthetic.meta };
}

async function run() {
  const assembled = await assembleDataset();
  const { examples, readiness, dataSource } = assembled;

  console.log('=== AgriSmart AI: training run ===');
  console.log(`Data source: ${dataSource}`);
  if (assembled.note) console.log(`Note: ${assembled.note}`);
  console.log('Data readiness:', JSON.stringify(readiness, null, 2));

  if (examples.length < 50) {
    console.log(
      `Only ${examples.length} labeled examples total — not enough to train or evaluate any model meaningfully, even for pipeline verification. Stopping without saving a model artifact.`
    );
    return { trained: false, readiness, dataSource };
  }

  const { train, validation, test } = splitChronological(examples);
  console.log(`Split sizes -> train: ${train.length}, validation: ${validation.length}, test: ${test.length}`);

  if (test.length < 10 || train.length < 20) {
    console.log('Split too small for a meaningful evaluation. Stopping without saving a model artifact.');
    return { trained: false, readiness, dataSource };
  }

  const XTrain = toMatrix(train);
  const yTrain = toLabels(train);
  const XTest = toMatrix(test);
  const yTest = toLabels(test);

  const model = trainLogisticRegression(XTrain, yTrain, { epochs: 300, learningRate: 0.15, l2: 0.01 });
  // Recorded once, from the TRAIN split only (never validation/test —
  // that would leak split composition into the OOD boundary), so
  // inference-time telemetry can be checked against what the model
  // actually learned from. See ai/inference/outOfDistribution.js.
  model.trainingFeatureRanges = computeFeatureRanges(XTrain);
  const testScores = predictProbaLogisticRegression(model, XTest);
  const testPreds = testScores.map((p) => (p >= 0.5 ? 1 : 0));
  const modelMetrics = evaluateBinaryClassifier(yTest, testPreds, testScores);

  const persistencePreds = test.map(() => persistenceBaselinePredict());
  const persistenceMetrics = evaluateBinaryClassifier(yTest, persistencePreds, null);

  const trendPreds = test.map((ex) => trendBaselinePredict(ex.features, DEFAULT_THRESHOLD));
  const trendMetrics = evaluateBinaryClassifier(yTest, trendPreds, null);

  const beatsPersistence = modelMetrics.f1 !== null && persistenceMetrics.f1 !== null
    ? modelMetrics.f1 > persistenceMetrics.f1
    : modelMetrics.f1 !== null;
  const beatsTrend = modelMetrics.f1 !== null && trendMetrics.f1 !== null && modelMetrics.f1 > trendMetrics.f1;

  console.log('Model (logistic regression) test metrics:', modelMetrics);
  console.log('Persistence baseline test metrics:', persistenceMetrics);
  console.log('Trend-extrapolation baseline test metrics:', trendMetrics);
  console.log(`Beats persistence baseline: ${beatsPersistence}. Beats trend baseline: ${beatsTrend}.`);

  const record = saveModel({
    target: TARGET,
    modelType: 'logistic_regression',
    featureVersion: FEATURE_VERSION,
    dataSource: dataSource === 'real' ? 'real' : 'synthetic-dev',
    datasetRange: {
      from: examples[0].asOf,
      to: examples[examples.length - 1].asOf,
      sampleCount: examples.length,
      trainCount: train.length,
      validationCount: validation.length,
      testCount: test.length,
    },
    metrics: modelMetrics,
    baselineMetrics: { persistence: persistenceMetrics, trend: trendMetrics },
    modelParams: model,
    status: 'candidate', // never auto-promoted regardless of dataSource — see ai/models/modelRegistry.js promoteModel()
  });

  console.log(`Saved model artifact: ${record.modelName} v${record.version} (status: ${record.status}, dataSource: ${record.dataSource})`);
  return { trained: true, record, readiness, dataSource };
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Training run failed:', err);
      process.exit(1);
    });
}

module.exports = { run, assembleDataset, MIN_REAL_EXAMPLES, TARGET };
