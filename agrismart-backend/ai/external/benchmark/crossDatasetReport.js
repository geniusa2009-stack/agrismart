'use strict';

/**
 * ai/external/benchmark/crossDatasetReport.js
 *
 * Cross-dataset generalization: train the SAME model type on dataset
 * A's full example set, evaluate on dataset B's full example set (no
 * internal train/test split within either — the split IS the dataset
 * boundary). This is the "more valuable than one impressive accuracy
 * number" experiment the spec asks for.
 *
 * Domain shift is reported structurally from provenance (country,
 * crop, soil type, sensor type, sampling frequency) — described, never
 * scored with an invented "shift index" number.
 *
 * Honesty gate: `mode` is 'real-generalization-study' ONLY when BOTH
 * datasets have provenance.ingested === true. With only fixtures
 * available, mode is 'infrastructure-selftest' and every metric this
 * produces is explicitly labeled non-transferable.
 */

const fs = require('fs');
const path = require('path');

const { loadDataset } = require('./datasetRegistry');
const { bridgeToAgriSmartShape } = require('./canonicalBridge');
const { buildExamplesForDevice } = require('../../data/datasetBuilder');
const { trainLogisticRegression, predictProbaLogisticRegression } = require('../../training/logisticRegression');
const { evaluateBinaryClassifier } = require('../../evaluation/metrics');
const { FEATURE_NAMES } = require('../../features/featureVersion');

const REPORTS_DIR = path.join(__dirname, '../reports');
const MIN_EXAMPLES = 30;
const DEFAULT_THRESHOLD_PERCENT = 30;

function examplesForDataset(datasetId) {
  const { provenance, records } = loadDataset(datasetId);
  const bridged = bridgeToAgriSmartShape(records);
  if (records.__irrigationEvents && bridged.length === 1) {
    bridged[0].irrigationHistory = records.__irrigationEvents;
  }
  let examples = [];
  for (const entity of bridged) {
    const { examples: entityExamples } = buildExamplesForDevice({
      deviceId: entity.entityId,
      valveId: entity.entityId,
      farmId: 'external-benchmark',
      telemetryHistory: entity.telemetryHistory,
      irrigationHistory: entity.irrigationHistory,
      thresholdPercent: DEFAULT_THRESHOLD_PERCENT,
    });
    examples = examples.concat(entityExamples);
  }
  examples.sort((a, b) => a.asOf - b.asOf);
  return { provenance, examples };
}

function describeDomainShift(provA, provB) {
  const dims = ['country', 'region', 'crop', 'soilType', 'sensorType', 'samplingFrequency'];
  return dims.map((dim) => ({
    dimension: dim,
    trainDataset: provA[dim],
    testDataset: provB[dim],
    differs: provA[dim] !== provB[dim],
  }));
}

function runCrossDatasetReport(trainDatasetId, testDatasetId) {
  const trainData = examplesForDataset(trainDatasetId);
  const testData = examplesForDataset(testDatasetId);

  const report = {
    trainDatasetId,
    testDatasetId,
    trainExampleCount: trainData.examples.length,
    testExampleCount: testData.examples.length,
    domainShift: describeDomainShift(trainData.provenance, testData.provenance),
    mode: trainData.provenance.ingested && testData.provenance.ingested ? 'real-generalization-study' : 'infrastructure-selftest',
    generatedAt: new Date().toISOString(),
  };

  if (trainData.examples.length < MIN_EXAMPLES || testData.examples.length < MIN_EXAMPLES) {
    report.status = 'INSUFFICIENT_DATA';
    report.reason = `train dataset yielded ${trainData.examples.length} examples, test dataset yielded ${testData.examples.length} (minimum ${MIN_EXAMPLES} each). Cannot run a cross-dataset experiment on this little data — reporting the shortfall rather than a number.`;
    return report;
  }

  const XTrain = trainData.examples.map((ex) => FEATURE_NAMES.map((n) => ex.features[n]));
  const yTrain = trainData.examples.map((ex) => ex.label);
  const XTest = testData.examples.map((ex) => FEATURE_NAMES.map((n) => ex.features[n]));
  const yTest = testData.examples.map((ex) => ex.label);

  const model = trainLogisticRegression(XTrain, yTrain, { epochs: 300, learningRate: 0.15, l2: 0.01 });
  const scores = predictProbaLogisticRegression(model, XTest);
  const preds = scores.map((p) => (p >= 0.5 ? 1 : 0));
  const crossMetrics = evaluateBinaryClassifier(yTest, preds, scores);

  report.status = 'COMPLETED';
  report.crossDatasetMetrics = crossMetrics;
  report.resultsAreTransferable = report.mode === 'real-generalization-study';
  if (!report.resultsAreTransferable) {
    report.transferabilityNote = 'At least one dataset in this comparison is not ingested real data (see provenance.ingested on each dataset). This run proves the cross-dataset benchmarking CODE works, not that AgriSmart\'s AI generalizes across real domains.';
  }
  return report;
}

if (require.main === module) {
  const [trainId, testId] = process.argv.slice(2).map((a) => a.replace(/^--(train|test)=/, ''));
  if (!trainId || !testId) {
    console.error('Usage: node crossDatasetReport.js --train=<datasetId> --test=<datasetId>');
    process.exit(1);
  }
  const report = runCrossDatasetReport(trainId, testId);
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const outPath = path.join(REPORTS_DIR, `cross.${trainId}__${testId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Written to ${outPath}`);
}

module.exports = { runCrossDatasetReport };
