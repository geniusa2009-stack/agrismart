'use strict';

/**
 * ai/evaluation/evaluate.js
 *
 * CLI: re-evaluates the latest saved model against a freshly-assembled
 * test split (rebuilt the same way training did) and prints a report.
 * Does not retrain — purely a read/report step, useful for spec
 * section 7's "compare model performance against the baseline" as a
 * standalone, repeatable command (npm run ai:evaluate).
 */

const { loadLatestModel } = require('../models/modelRegistry');
const { assembleDataset, TARGET } = require('../training/train');
const { splitChronological } = require('../training/splitChronological');
const { predictProbaLogisticRegression } = require('../training/logisticRegression');
const { persistenceBaselinePredict, trendBaselinePredict } = require('../training/baseline');
const { evaluateBinaryClassifier } = require('./metrics');
const { FEATURE_NAMES } = require('../features/featureVersion');

async function run() {
  const record = loadLatestModel(TARGET);
  if (!record) {
    console.log(`No saved model found for target "${TARGET}". Run "npm run ai:train" first.`);
    return { evaluated: false };
  }

  console.log(`Evaluating ${record.modelName} v${record.version} (dataSource: ${record.dataSource}, status: ${record.status})`);

  const { examples } = await assembleDataset();
  const { test } = splitChronological(examples);
  if (test.length === 0) {
    console.log('No test examples available to evaluate against.');
    return { evaluated: false };
  }

  const X = test.map((ex) => FEATURE_NAMES.map((name) => ex.features[name]));
  const yTrue = test.map((ex) => ex.label);
  const scores = predictProbaLogisticRegression(record.modelParams, X);
  const preds = scores.map((p) => (p >= 0.5 ? 1 : 0));

  const modelMetrics = evaluateBinaryClassifier(yTrue, preds, scores);
  const persistenceMetrics = evaluateBinaryClassifier(yTrue, test.map(() => persistenceBaselinePredict()), null);
  const trendMetrics = evaluateBinaryClassifier(yTrue, test.map((ex) => trendBaselinePredict(ex.features, 30)), null);

  console.log('Model metrics:', modelMetrics);
  console.log('Persistence baseline:', persistenceMetrics);
  console.log('Trend baseline:', trendMetrics);
  console.log(`dataSource=${record.dataSource} — treat these numbers as synthetic-dev pipeline verification unless dataSource is "real".`);

  return { evaluated: true, modelMetrics, persistenceMetrics, trendMetrics, dataSource: record.dataSource };
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Evaluation failed:', err);
      process.exit(1);
    });
}

module.exports = { run };
