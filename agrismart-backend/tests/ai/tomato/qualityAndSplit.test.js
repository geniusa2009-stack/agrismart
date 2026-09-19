'use strict';

const { runTabularQualityChecks } = require('../../../ai/external/quality/tabularQualityEngine');
const { splitByPlantingDay } = require('../../../ai/training/tomato/splitByPlantingDay');
const { assertNoOverlapBetweenSplits, LeakageError } = require('../../../ai/external/leakage/leakageGuards');

function fakeRecord(daysSincePlanting, overrides = {}) {
  return {
    rowIndex: 0,
    daysSincePlanting,
    cropStage: 'Mid stage',
    trialId: 'mendeley-tomato-irrigation-trial',
    airTemperatureCelsius: 25,
    relativeHumidityPercent: 80,
    soilMoistureRaw: 400,
    referenceEvapotranspiration: 500,
    evapotranspiration: 300,
    cropCoefficient: 1,
    soilNitrogenMgPerKg: 90,
    soilPhosphorusMgPerKg: 70,
    soilPotassiumMgPerKg: 85,
    solarRadiationWPerM2: 400,
    windSpeedMPerS: 2,
    soilPh: 6.5,
    source: 'external',
    datasetId: 'test',
    ...overrides,
  };
}

describe('tabularQualityEngine', () => {
  test('flags empty dataset as CRITICAL', () => {
    const result = runTabularQualityChecks([]);
    expect(result.findings[0].level).toBe('CRITICAL');
  });

  test('flags implausible pH and reports duplicate-row count', () => {
    const records = [fakeRecord(1, { soilPh: 1.0 }), fakeRecord(2, { soilPh: 1.0 })];
    const result = runTabularQualityChecks(records, { duplicateRowCount: 1 });
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain('IMPLAUSIBLE_VALUE');
    expect(codes).toContain('DUPLICATE_ROWS');
  });

  test('flags a constant column', () => {
    const records = [fakeRecord(1, { windSpeedMPerS: 2 }), fakeRecord(2, { windSpeedMPerS: 2 }), fakeRecord(3, { windSpeedMPerS: 2 })];
    const result = runTabularQualityChecks(records);
    expect(result.findings.some((f) => f.code === 'CONSTANT_COLUMN' && f.context.field === 'windSpeedMPerS')).toBe(true);
  });
});

describe('splitByPlantingDay', () => {
  test('never splits a single day-group across train/validation/test', () => {
    const records = [];
    for (let day = 1; day <= 20; day += 1) {
      for (let i = 0; i < 10; i += 1) records.push(fakeRecord(day));
    }
    const { train, validation, test } = splitByPlantingDay(records, { trainFraction: 0.7, valFraction: 0.15 });
    const trainDays = new Set(train.map((r) => r.daysSincePlanting));
    const valDays = new Set(validation.map((r) => r.daysSincePlanting));
    const testDays = new Set(test.map((r) => r.daysSincePlanting));
    for (const d of trainDays) {
      expect(valDays.has(d)).toBe(false);
      expect(testDays.has(d)).toBe(false);
    }
    for (const d of valDays) {
      expect(testDays.has(d)).toBe(false);
    }
    expect(train.length + validation.length + test.length).toBe(records.length);
  });

  test('assertNoOverlapBetweenSplits passes on a leak-free grouped split', () => {
    const records = [];
    for (let day = 1; day <= 10; day += 1) {
      for (let i = 0; i < 5; i += 1) records.push(fakeRecord(day));
    }
    const { train, test } = splitByPlantingDay(records, { trainFraction: 0.7, valFraction: 0.15 });
    expect(() =>
      assertNoOverlapBetweenSplits(train, test, { timestampKey: 'daysSincePlanting', entityKey: 'trialId', requireChronological: true })
    ).not.toThrow();
  });

  test('assertNoOverlapBetweenSplits throws LeakageError on a deliberately broken (non-grouped) split', () => {
    // Simulate the bug this whole module exists to avoid: slicing by raw
    // row index instead of by day-group, splitting day 5's rows across
    // both sides.
    const records = [];
    for (let day = 1; day <= 3; day += 1) {
      for (let i = 0; i < 4; i += 1) records.push(fakeRecord(day));
    }
    const brokenTrain = records.slice(0, 6); // cuts day 2's block in half
    const brokenTest = records.slice(6);
    expect(() =>
      assertNoOverlapBetweenSplits(brokenTrain, brokenTest, { timestampKey: 'daysSincePlanting', entityKey: 'trialId', requireChronological: true })
    ).toThrow(LeakageError);
  });
});
