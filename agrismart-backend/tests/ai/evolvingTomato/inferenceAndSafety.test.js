'use strict';

const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = path.join(__dirname, '../../../ai/models/artifacts');
const TEST_TARGET = 'irrigation_event_next_1h_TESTONLY';

function writeModelFile(version, overrides = {}) {
  const record = {
    modelName: `${TEST_TARGET}-logistic_regression`,
    version,
    trainingTimestamp: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    featureVersion: 'tomato-v1',
    dataSource: 'external',
    datasetIds: ['evolving-tomato-testbed-2024'],
    evaluationMethod: 'chronological-split-in-season-plus-fully-external-2025-season',
    datasetRange: { from: null, to: null, sampleCount: 1000 },
    trainingSampleCount: 1000,
    metrics: { rocAuc: 0.26, averagePrecision: 0.05, n: 150 },
    baselineMetrics: { rocAuc: 0.5, averagePrecision: 0.03 },
    modelType: 'logistic_regression',
    target: TEST_TARGET,
    hyperparameters: { l2: 0.1 },
    status: overrides.status || 'candidate',
    modelParams: {
      weights: new Array(12).fill(0),
      bias: 0,
      standardizeMean: new Array(12).fill(0),
      standardizeStd: new Array(12).fill(1),
      trainingFeatureRanges: { soilMoisturePercent: { min: 10, max: 60 } },
    },
  };
  fs.writeFileSync(path.join(ARTIFACTS_DIR, `${TEST_TARGET}.v${version}.json`), JSON.stringify(record, null, 2));
  fs.writeFileSync(path.join(ARTIFACTS_DIR, `${TEST_TARGET}.latest.json`), JSON.stringify(record, null, 2));
  return record;
}

// See tests/ai/tomato/inferenceAndSafety.test.js for why this overwrites
// rather than unlink()s: this device's mounted repo folder does not
// permit unlink() from this sandboxed shell (EPERM). Clearly namespaced
// (…_TESTONLY) and never read by any real code path.
function cleanup() {
  for (const f of fs.readdirSync(ARTIFACTS_DIR)) {
    if (f.startsWith(TEST_TARGET)) fs.writeFileSync(path.join(ARTIFACTS_DIR, f), JSON.stringify({ note: 'test-only placeholder, safe to ignore/delete manually' }));
  }
}

describe('irrigation_event_next_1h model registry lifecycle', () => {
  const { promoteModel, STATUS } = require('../../../ai/models/modelRegistry');

  test('promoteModel enforces the lifecycle table for this target (candidate cannot jump straight to active)', () => {
    writeModelFile(9001, { status: 'candidate' });
    try {
      expect(() => promoteModel(TEST_TARGET, 9001, STATUS.ACTIVE)).toThrow(/Invalid status transition/);
      const promoted = promoteModel(TEST_TARGET, 9001, STATUS.VALIDATED);
      expect(promoted.status).toBe('validated');
    } finally {
      cleanup();
    }
  });
});

describe('irrigation_event_next_1h inference safety boundary', () => {
  const { loadLatestModel } = require('../../../ai/models/modelRegistry');
  const REAL_TARGET = require('../../../ai/training/evolvingTomato/train').TARGET;

  test('the real registered model is still "candidate" (did not pass validation) and inference refuses to serve it', () => {
    const record = loadLatestModel(REAL_TARGET);
    expect(record).not.toBeNull();
    expect(record.status).toBe('candidate');

    const { predictIrrigationEventLikelihood } = require('../../../ai/inference/predictIrrigationEventLikelihood');
    const now = new Date();
    const telemetryHistory = [0, 1, 2, 3, 4].map((i) => ({
      recordedAt: new Date(now.getTime() - (4 - i) * 10 * 60 * 1000),
      readings: { soilMoisturePercent: 40, temperatureCelsius: 22, soilSalinityPpt: 1 },
    }));
    const result = predictIrrigationEventLikelihood({ telemetryHistory, irrigationHistory: [], asOf: now });
    expect(result.available).toBe(false);
    expect(result.fallback).toBe(true);
    expect(result.probability).toBeNull();
    expect(result.reason).toMatch(/candidate/i);
  });

  test('refuses to serve when fewer than MIN_HISTORY_POINTS telemetry readings are available', () => {
    const { predictIrrigationEventLikelihood, MIN_HISTORY_POINTS } = require('../../../ai/inference/predictIrrigationEventLikelihood');
    const result = predictIrrigationEventLikelihood({ telemetryHistory: [{ recordedAt: new Date(), readings: { soilMoisturePercent: 40 } }], irrigationHistory: [] });
    expect(MIN_HISTORY_POINTS).toBeGreaterThan(1);
    expect(result.available).toBe(false);
  });
});

describe('safety boundary: new irrigation-event files never import/call actuation services', () => {
  const FILES_TO_SCAN = [
    '../../../ai/inference/predictIrrigationEventLikelihood.js',
    '../../../ai/training/evolvingTomato/train.js',
    '../../../ai/external/adapters/evolvingTomatoCsvAdapter.js',
    '../../../ai/features/irrigationEventLabel.js',
    '../../../ai/training/evolvingTomato/buildExamples.js',
  ];

  test.each(FILES_TO_SCAN)('%s does not reference commandsService, irrigationService, or openValve/closeValve', (relPath) => {
    const source = fs.readFileSync(path.join(__dirname, relPath), 'utf8');
    expect(source).not.toMatch(/commands\.service/);
    expect(source).not.toMatch(/irrigation\.service/);
    expect(source).not.toMatch(/openValve\(/);
    expect(source).not.toMatch(/closeValve\(/);
  });

  test('ai.controller.js\'s new getIrrigationEventLikelihood endpoint calls only the advisory predictor, in its own function body', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../../src/modules/ai/ai.controller.js'), 'utf8');
    const startIdx = source.indexOf('const getIrrigationEventLikelihood = asyncHandler(');
    const endIdx = source.indexOf('module.exports');
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);
    const fnBody = source.slice(startIdx, endIdx);
    expect(fnBody).not.toMatch(/commandsService/);
    expect(fnBody).not.toMatch(/irrigationService/);
    expect(fnBody).toMatch(/predictIrrigationEventLikelihood/);
  });
});
