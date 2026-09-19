'use strict';

const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = path.join(__dirname, '../../../ai/models/artifacts');
const TARGET = 'tomato_soil_moisture_estimate_TESTONLY';

function writeModelFile(version, overrides = {}) {
  const record = {
    modelName: `${TARGET}-ridge_linear_regression`,
    version,
    trainingTimestamp: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    featureVersion: 'tomato-v1',
    dataSource: 'external',
    datasetIds: ['mendeley-tomato-irrigation-33cngpcrmx-v2'],
    evaluationMethod: 'grouped-chronological-split-by-planting-day',
    datasetRange: { from: null, to: null, sampleCount: 2972 },
    trainingSampleCount: 2972,
    metrics: { mae: 138.9, rmse: 162.1, r2: -0.01, n: 300 },
    baselineMetrics: {},
    modelType: 'ridge_linear_regression',
    target: TARGET,
    hyperparameters: { epochs: 800, learningRate: 0.05, l2: 1 },
    status: overrides.status || 'candidate',
    modelParams: {
      weights: new Array(16).fill(0),
      bias: 400,
      imputationMeans: new Array(16).fill(0),
      standardizeMean: new Array(16).fill(0),
      standardizeStd: new Array(16).fill(1),
      trainingFeatureRanges: {
        airTemperatureCelsius: { min: 18, max: 32 },
      },
    },
  };
  fs.writeFileSync(path.join(ARTIFACTS_DIR, `${TARGET}.v${version}.json`), JSON.stringify(record, null, 2));
  fs.writeFileSync(path.join(ARTIFACTS_DIR, `${TARGET}.latest.json`), JSON.stringify(record, null, 2));
  return record;
}

// NOTE: this device's mounted repo folder does not permit unlink() from
// this sandboxed shell (EPERM), so cleanup overwrites the throwaway
// TESTONLY artifact files with an inert placeholder instead of deleting
// them. They are clearly namespaced (…_TESTONLY) and never read by any
// real code path (ai/training/tomato/train.js's TARGET constant is a
// different, fixed string), so leaving an overwritten placeholder behind
// is harmless.
function cleanup() {
  for (const f of fs.readdirSync(ARTIFACTS_DIR)) {
    if (f.startsWith(TARGET)) fs.writeFileSync(path.join(ARTIFACTS_DIR, f), JSON.stringify({ note: 'test-only placeholder, safe to ignore/delete manually' }));
  }
}

// predictTomatoSoilMoisture.js hardcodes the real TARGET constant via
// ai/training/tomato/train.js, so these tests exercise the real target's
// registry entry directly (saving/removing a throwaway candidate version)
// rather than trying to inject a fake target name into a module that
// intentionally does not accept one as a parameter (see file header:
// the target is fixed on purpose so callers cannot silently query a
// different model under the same code path).
describe('tomato inference safety boundary', () => {
  const { loadLatestModel, promoteModel, STATUS } = require('../../../ai/models/modelRegistry');
  const REAL_TARGET = require('../../../ai/training/tomato/train').TARGET;

  let savedOriginal;

  beforeAll(() => {
    savedOriginal = loadLatestModel(REAL_TARGET);
  });

  afterAll(() => {
    if (savedOriginal) {
      fs.writeFileSync(path.join(ARTIFACTS_DIR, `${REAL_TARGET}.latest.json`), JSON.stringify(savedOriginal, null, 2));
    }
  });

  test('refuses to serve a prediction when the latest model status is "candidate"', () => {
    const record = loadLatestModel(REAL_TARGET);
    expect(record).not.toBeNull();
    // The real trained model from ai/training/tomato/train.js did not
    // meet its own validation criteria (see AI_TRAINING_REPORT.md) and
    // must therefore still be "candidate" here.
    expect(record.status).toBe('candidate');

    const { predictSoilMoistureEstimate } = require('../../../ai/inference/predictTomatoSoilMoisture');
    const result = predictSoilMoistureEstimate({
      airTemperatureCelsius: 25,
      relativeHumidityPercent: 80,
      referenceEvapotranspiration: 500,
      evapotranspiration: 300,
      cropCoefficient: 1,
      soilNitrogenMgPerKg: 90,
      soilPhosphorusMgPerKg: 70,
      soilPotassiumMgPerKg: 85,
      solarRadiationWPerM2: 400,
      windSpeedMPerS: 2,
      daysSincePlanting: 60,
      soilPh: 6.5,
      cropStage: 'Mid stage',
    });
    expect(result.available).toBe(false);
    expect(result.fallback).toBe(true);
    expect(result.estimatedValue).toBeNull();
    expect(result.reason).toMatch(/candidate/i);
  });

  test('rejects malformed/incomplete input rather than guessing missing fields', () => {
    const { predictSoilMoistureEstimate } = require('../../../ai/inference/predictTomatoSoilMoisture');
    const result = predictSoilMoistureEstimate({ airTemperatureCelsius: 25 }); // missing everything else
    expect(result.available).toBe(false);
  });

  test('promoteModel enforces the lifecycle table for this target too (candidate cannot jump to active)', () => {
    writeModelFile(9001, { status: 'candidate' });
    try {
      expect(() => promoteModel(TARGET, 9001, STATUS.ACTIVE)).toThrow(/Invalid status transition/);
      const promoted = promoteModel(TARGET, 9001, STATUS.VALIDATED);
      expect(promoted.status).toBe('validated');
    } finally {
      cleanup();
    }
  });
});

describe('safety boundary: predictTomatoSoilMoisture.js never imports actuation services', () => {
  test('source does not reference commandsService or irrigationService open/closeValve', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../../ai/inference/predictTomatoSoilMoisture.js'), 'utf8');
    expect(source).not.toMatch(/commands\.service/);
    expect(source).not.toMatch(/irrigation\.service/);
    expect(source).not.toMatch(/openValve\(/);
    expect(source).not.toMatch(/closeValve\(/);
  });

  test('ai.controller.js\'s new endpoint calls only the advisory predictor, not any actuation service, in its own function body', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../../src/modules/ai/ai.controller.js'), 'utf8');
    const fnMatch = source.match(/const postSoilMoistureEstimate = asyncHandler\(async \(req, res\) => \{[\s\S]*?\}\);/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch[0]).not.toMatch(/commandsService/);
    expect(fnMatch[0]).not.toMatch(/irrigationService/);
    expect(fnMatch[0]).toMatch(/predictSoilMoistureEstimate/);
  });
});
