'use strict';

const { buildExamplesForZone, HORIZON_STEPS, HORIZON_MS } = require('../../../ai/training/arnesano/buildExamples');

const TEN_MIN_MS = 10 * 60 * 1000;

function makeRecord(ts, soilMoisture, overrides = {}) {
  return {
    timestamp: new Date(ts),
    soilMoisture,
    airTemperature: 20,
    relativeHumidity: 60,
    precipitation: 0,
    solarRadiation: 100,
    windSpeed: 2,
    soilEc: 0.5,
    soilPh: 6.5,
    irrigationDurationSeconds: 0,
    waterVolumeLiters: 0,
    _soilTemperature0to7cm: 18,
    _soilTemperature7to18cm: 17,
    ...overrides,
  };
}

describe('buildExamplesForZone — true 24h horizon, leak-free by construction', () => {
  const start = Date.parse('2025-03-01T00:00:00.000Z');

  test('label is exactly the reading 144 steps (true 24h) ahead, never fabricated when missing', () => {
    const n = 200;
    const records = Array.from({ length: n }, (_, i) => makeRecord(start + i * TEN_MIN_MS, 40 + (i % 5)));
    // knock out the future reading for row 10's target (row 10+144=154)
    records[154].soilMoisture = null;

    const { examples, skippedNoFutureReading } = buildExamplesForZone(records, { entityId: 'zone-test' });
    expect(skippedNoFutureReading).toBeGreaterThanOrEqual(1);
    const ex10 = examples.find((e) => e.asOf.getTime() === records[10].timestamp.getTime());
    expect(ex10).toBeUndefined(); // must be skipped, not fabricated

    // Row 0 has no example: the backward-looking waterLitersPast4h
    // feature needs 24 prior steps of history, so the first eligible
    // row is index 23 (PAST_WATER_STEPS - 1), not index 0.
    const FIRST_ELIGIBLE_INDEX = 23;
    const ex = examples.find((e) => e.asOf.getTime() === records[FIRST_ELIGIBLE_INDEX].timestamp.getTime());
    expect(ex).toBeDefined();
    expect(ex.label).toBe(records[FIRST_ELIGIBLE_INDEX + HORIZON_STEPS].soilMoisture);
  });

  test('skips rows with no current reading rather than imputing a label input', () => {
    const n = 160;
    const records = Array.from({ length: n }, (_, i) => makeRecord(start + i * TEN_MIN_MS, 40));
    records[5].soilMoisture = null;
    const { examples, skippedNoCurrentReading } = buildExamplesForZone(records, { entityId: 'zone-test' });
    expect(skippedNoCurrentReading).toBeGreaterThanOrEqual(1);
    expect(examples.some((e) => e.asOf.getTime() === records[5].timestamp.getTime())).toBe(false);
  });

  test('flags (and skips, rather than mislabels) a grid-gap anomaly where +144 rows is not actually +24h', () => {
    const n = 160;
    const records = Array.from({ length: n }, (_, i) => makeRecord(start + i * TEN_MIN_MS, 40));
    // Corrupt one future timestamp so index+144 no longer equals +24h exactly.
    records[150] = { ...records[150], timestamp: new Date(records[150].timestamp.getTime() + 5 * 60 * 1000) };
    const { examples, skippedGridGapAnomaly } = buildExamplesForZone(records, { entityId: 'zone-test' });
    expect(skippedGridGapAnomaly).toBeGreaterThanOrEqual(1);
    expect(examples.some((e) => e.asOf.getTime() === records[6].timestamp.getTime())).toBe(false);
  });

  test('waterLitersPast4h is strictly backward-looking (unaffected by future irrigation)', () => {
    const n = 200;
    const records = Array.from({ length: n }, (_, i) => makeRecord(start + i * TEN_MIN_MS, 40));
    records[5].waterVolumeLiters = 10; // irrigation BEFORE row 30
    records[40].waterVolumeLiters = 999; // irrigation AFTER row 30 — must not leak backward
    const { examples } = buildExamplesForZone(records, { entityId: 'zone-test' });
    const ex30 = examples.find((e) => e.asOf.getTime() === records[30].timestamp.getTime());
    expect(ex30).toBeDefined();
    expect(ex30.features.waterLitersPast4h).toBeLessThan(50); // must not include the future 999L event
  });

  test('HORIZON_MS is exactly 24 hours', () => {
    expect(HORIZON_MS).toBe(24 * 60 * 60 * 1000);
  });
});
