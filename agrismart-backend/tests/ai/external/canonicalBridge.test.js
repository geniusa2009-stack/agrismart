'use strict';

const { bridgeToAgriSmartShape } = require('../../../ai/external/benchmark/canonicalBridge');

describe('ai/external/benchmark/canonicalBridge', () => {
  test('derives irrigation events from open/closed transitions without fabricating durations', () => {
    const records = [
      { timestamp: new Date('2026-01-01T00:00:00Z'), fieldId: 'f1', soilMoisture: 40, soilTemperature: null, airTemperature: null, soilSalinity: null, irrigationState: 'closed' },
      { timestamp: new Date('2026-01-01T00:30:00Z'), fieldId: 'f1', soilMoisture: 35, soilTemperature: null, airTemperature: null, soilSalinity: null, irrigationState: 'open' },
      { timestamp: new Date('2026-01-01T01:00:00Z'), fieldId: 'f1', soilMoisture: 45, soilTemperature: null, airTemperature: null, soilSalinity: null, irrigationState: 'closed' },
    ];
    const [entity] = bridgeToAgriSmartShape(records);
    expect(entity.irrigationHistory.length).toBe(1);
    expect(entity.irrigationHistory[0].actualDurationSeconds).toBe(1800);
  });

  test('a dataset with no irrigationState column yields zero irrigation events (missing, not fabricated)', () => {
    const records = [{ timestamp: new Date(), fieldId: 'f1', soilMoisture: 40, soilTemperature: null, airTemperature: null, soilSalinity: null, irrigationState: null }];
    const [entity] = bridgeToAgriSmartShape(records);
    expect(entity.irrigationHistory.length).toBe(0);
  });

  test('groups records by entity (fieldId) so different plots/devices never mix telemetry', () => {
    const records = [
      { timestamp: new Date('2026-01-01T00:00:00Z'), fieldId: 'f1', soilMoisture: 40, soilTemperature: null, airTemperature: null, soilSalinity: null, irrigationState: null },
      { timestamp: new Date('2026-01-01T00:00:00Z'), fieldId: 'f2', soilMoisture: 60, soilTemperature: null, airTemperature: null, soilSalinity: null, irrigationState: null },
    ];
    const bridged = bridgeToAgriSmartShape(records);
    expect(bridged.length).toBe(2);
  });
});
