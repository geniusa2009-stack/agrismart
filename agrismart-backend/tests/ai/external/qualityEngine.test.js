'use strict';

const { runQualityChecks } = require('../../../ai/external/quality/qualityEngine');

function rec(overrides) {
  return {
    timestamp: new Date('2026-01-01T00:00:00Z'),
    fieldId: 'f1',
    soilMoisture: 40,
    soilTemperature: 20,
    soilEc: null,
    soilSalinity: null,
    airTemperature: null,
    relativeHumidity: null,
    precipitation: null,
    irrigationDurationSeconds: null,
    ...overrides,
  };
}

describe('ai/external/quality/qualityEngine', () => {
  test('flags an impossible value as ERROR', () => {
    const records = [rec({ soilMoisture: 140 })];
    const { findings } = runQualityChecks(records);
    expect(findings.some((f) => f.code === 'IMPOSSIBLE_VALUE' && f.level === 'ERROR')).toBe(true);
  });

  test('flags a flatlined sensor as WARNING', () => {
    const records = Array.from({ length: 8 }, (_, i) => rec({ timestamp: new Date(Date.now() + i * 3600 * 1000), soilMoisture: 33 }));
    const { findings } = runQualityChecks(records);
    expect(findings.some((f) => f.code === 'SENSOR_FLATLINE')).toBe(true);
  });

  test('flags a sudden spike as WARNING', () => {
    const records = [rec({ soilMoisture: 30 }), rec({ timestamp: new Date('2026-01-01T01:00:00Z'), soilMoisture: 90 })];
    const { findings } = runQualityChecks(records);
    expect(findings.some((f) => f.code === 'SENSOR_SPIKE')).toBe(true);
  });

  test('reports a field as entirely absent (INFO) rather than pretending it exists', () => {
    const records = [rec({}), rec({ timestamp: new Date('2026-01-01T01:00:00Z') })];
    const { findings } = runQualityChecks(records);
    expect(findings.some((f) => f.code === 'FIELD_ENTIRELY_ABSENT' && f.context.field === 'soilEc')).toBe(true);
  });

  test('detects duplicate timestamps for the same entity', () => {
    const records = [rec({}), rec({})];
    const { findings } = runQualityChecks(records);
    expect(findings.some((f) => f.code === 'DUPLICATE_TIMESTAMPS')).toBe(true);
  });

  test('an empty dataset is CRITICAL, not silently a clean report', () => {
    const { findings } = runQualityChecks([]);
    expect(findings[0].level).toBe('CRITICAL');
  });

  test('a clean, unremarkable dataset produces no ERROR/CRITICAL findings', () => {
    const records = Array.from({ length: 5 }, (_, i) => rec({ timestamp: new Date(Date.now() + i * 3600 * 1000), soilMoisture: 40 + i }));
    const { summary } = runQualityChecks(records);
    expect(summary.errors).toBe(0);
    expect(summary.critical).toBe(0);
  });
});
