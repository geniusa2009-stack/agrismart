'use strict';

const fs = require('fs');
const path = require('path');

describe('arnesano_soil_moisture_24h_forecast inference safety boundary', () => {
  const { loadLatestModel } = require('../../../ai/models/modelRegistry');
  const REAL_TARGET = require('../../../ai/training/arnesano/train').TARGET;

  test('the real registered model is "candidate" (failed the cross-crop validation gate) and inference refuses to serve it', () => {
    const record = loadLatestModel(REAL_TARGET);
    expect(record).not.toBeNull();
    expect(record.status).toBe('candidate');

    const { predictArnesanoSoilMoisture24h } = require('../../../ai/inference/predictArnesanoSoilMoisture24h');
    const result = predictArnesanoSoilMoisture24h({
      airTemperature: 22, relativeHumidity: 60, precipitation: 0, solarRadiation: 200,
      windSpeed: 2, soilTemperature0to7cm: 20, soilTemperature7to18cm: 19, soilEc: 0.4,
      soilPh: 6.5, soilMoisture: 45, irrigationDurationSecondsCurrentBin: 0,
      waterLitersPast4h: 0, hourOfDay: 12, dayOfWeek: 2, month: 6,
    });
    expect(result.available).toBe(false);
    expect(result.fallback).toBe(true);
    expect(result.predictedSoilMoisturePercent).toBeNull();
    expect(result.reason).toMatch(/candidate/i);
  });

  test('rejects malformed input (wrong type) rather than silently coercing it', () => {
    const { predictArnesanoSoilMoisture24h } = require('../../../ai/inference/predictArnesanoSoilMoisture24h');
    const result = predictArnesanoSoilMoisture24h({ soilMoisture: 'not-a-number' });
    expect(result.available).toBe(false);
  });

  test('returns unavailable (not a crash) when given an empty observation', () => {
    const { predictArnesanoSoilMoisture24h } = require('../../../ai/inference/predictArnesanoSoilMoisture24h');
    const result = predictArnesanoSoilMoisture24h({});
    expect(result.available).toBe(false);
  });
});

describe('safety boundary: new arnesano files never import/call actuation services', () => {
  const FILES_TO_SCAN = [
    '../../../ai/inference/predictArnesanoSoilMoisture24h.js',
    '../../../ai/training/arnesano/train.js',
    '../../../ai/training/arnesano/buildExamples.js',
    '../../../ai/external/adapters/arnesanoCsvAdapter.js',
  ];

  test.each(FILES_TO_SCAN)('%s does not reference commandsService, irrigationService, or openValve/closeValve', (relPath) => {
    const source = fs.readFileSync(path.join(__dirname, relPath), 'utf8');
    expect(source).not.toMatch(/commands\.service/);
    expect(source).not.toMatch(/irrigation\.service/);
    expect(source).not.toMatch(/openValve\(/);
    expect(source).not.toMatch(/closeValve\(/);
  });

  test('ai.controller.js\'s new postArnesanoSoilMoistureForecast endpoint calls only the advisory predictor', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../../src/modules/ai/ai.controller.js'), 'utf8');
    const startIdx = source.indexOf('const postArnesanoSoilMoistureForecast = asyncHandler(');
    const endIdx = source.indexOf('module.exports');
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);
    const fnBody = source.slice(startIdx, endIdx);
    expect(fnBody).not.toMatch(/commandsService/);
    expect(fnBody).not.toMatch(/irrigationService/);
    expect(fnBody).toMatch(/predictArnesanoSoilMoisture24h/);
  });
});
