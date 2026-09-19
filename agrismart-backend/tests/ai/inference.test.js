'use strict';

const { PredictionSchema } = require('../../ai/schemas/prediction.schema');

describe('ai/inference/predict (schema + graceful fallback)', () => {
  test('returns a schema-valid "insufficient data" prediction when history is too short', () => {
    jest.resetModules();
    const { predict } = require('../../ai/inference/predict');
    const result = predict({ telemetryHistory: [{ recordedAt: new Date(), readings: { soilMoisturePercent: 40 } }], irrigationHistory: [] });
    expect(() => PredictionSchema.parse(result)).not.toThrow();
    expect(result.available).toBe(false);
    expect(result.fallback).toBe(true);
    expect(result.recommendation).toBe('insufficient_data');
  });

  test('returns a schema-valid fallback prediction when no model artifact exists', () => {
    jest.resetModules();
    jest.doMock('../../ai/models/modelRegistry', () => ({ loadLatestModel: () => null }));
    const { predict } = require('../../ai/inference/predict');
    const telemetryHistory = Array.from({ length: 10 }, (_, i) => ({
      recordedAt: new Date(Date.now() - i * 60 * 60 * 1000),
      readings: { soilMoisturePercent: 50, temperatureCelsius: 25, soilSalinityPpt: 1.1 },
    })).reverse();
    const result = predict({ telemetryHistory, irrigationHistory: [] });
    expect(() => PredictionSchema.parse(result)).not.toThrow();
    expect(result.available).toBe(false);
    expect(result.fallback).toBe(true);
    jest.dontMock('../../ai/models/modelRegistry');
  });

  test('refuses to serve a model whose featureVersion does not match the current extractor', () => {
    jest.resetModules();
    jest.doMock('../../ai/models/modelRegistry', () => ({
      loadLatestModel: () => ({ featureVersion: 'v0-outdated', dataSource: 'real', version: 1, modelType: 'logistic_regression', modelParams: {} }),
    }));
    const { predict } = require('../../ai/inference/predict');
    const telemetryHistory = Array.from({ length: 10 }, (_, i) => ({
      recordedAt: new Date(Date.now() - i * 60 * 60 * 1000),
      readings: { soilMoisturePercent: 50 },
    })).reverse();
    const result = predict({ telemetryHistory, irrigationHistory: [] });
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/feature version/i);
    jest.dontMock('../../ai/models/modelRegistry');
  });
});
