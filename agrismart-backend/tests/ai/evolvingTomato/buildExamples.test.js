'use strict';

const { buildExamplesForZone, buildDatasetFromBridged, DEFAULT_HORIZON_MS, DEFAULT_STRIDE } = require('../../../ai/training/evolvingTomato/buildExamples');

const TEN_MIN_MS = 10 * 60 * 1000;

function makeTelemetry(count, startTime) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      recordedAt: new Date(startTime + i * TEN_MIN_MS),
      readings: { soilMoisturePercent: 40 + (i % 5), temperatureCelsius: 22, soilSalinityPpt: 1.2 },
    });
  }
  return arr;
}

describe('buildExamplesForZone — small synthetic fixture (not the full real dataset, for speed)', () => {
  const start = Date.parse('2024-07-01T00:00:00.000Z');
  const telemetryHistory = makeTelemetry(30, start); // 30 readings * 10 min = 5 hours of history

  test('produces one example per stride step that has a fully-observed label window', () => {
    const irrigationHistory = [{ startedAt: new Date(start + 12 * TEN_MIN_MS), endedAt: new Date(start + 15 * TEN_MIN_MS) }];
    const { examples, skippedNoFutureLabel } = buildExamplesForZone({
      entityId: 'zone-test-1',
      telemetryHistory,
      irrigationHistory,
      horizonMs: DEFAULT_HORIZON_MS,
      stride: 1,
    });
    // last few points can't have a fully-observed 1h-ahead window given only 5h of history
    expect(skippedNoFutureLabel).toBeGreaterThan(0);
    expect(examples.length).toBeGreaterThan(0);
    for (const ex of examples) {
      expect([0, 1]).toContain(ex.label);
      expect(ex.entityId).toBe('zone-test-1');
      expect(ex.features.soilMoisturePercent).not.toBeNull();
    }
  });

  test('the default stride subsamples rather than building one example per reading', () => {
    const { examples } = buildExamplesForZone({
      entityId: 'zone-test-1',
      telemetryHistory,
      irrigationHistory: [],
      stride: DEFAULT_STRIDE,
    });
    // stride=6 over 30 points -> at most 5 candidate asOf points considered
    expect(examples.length).toBeLessThanOrEqual(5);
  });

  test('label is true only for examples where a NEW event genuinely starts within the horizon (onset, not persistence)', () => {
    // event starts at reading index 12 (i.e. at start + 120min)
    const irrigationHistory = [{ startedAt: new Date(start + 12 * TEN_MIN_MS), endedAt: null }];
    const { examples } = buildExamplesForZone({
      entityId: 'zone-test-1',
      telemetryHistory,
      irrigationHistory,
      horizonMs: DEFAULT_HORIZON_MS,
      stride: 1,
    });
    const positives = examples.filter((e) => e.label === 1);
    expect(positives.length).toBeGreaterThan(0);
    for (const ex of positives) {
      const eventStart = irrigationHistory[0].startedAt.getTime();
      expect(eventStart).toBeGreaterThan(ex.asOf.getTime());
      expect(eventStart).toBeLessThanOrEqual(ex.asOf.getTime() + DEFAULT_HORIZON_MS);
    }
  });
});

describe('buildDatasetFromBridged — aggregates across entities and reports readiness honestly', () => {
  test('combines multiple zones, sorts by time, and reports per-entity counts', () => {
    const start = Date.parse('2024-07-01T00:00:00.000Z');
    const bridged = [
      { entityId: 'line-1', telemetryHistory: makeTelemetry(20, start), irrigationHistory: [{ startedAt: new Date(start + 5 * TEN_MIN_MS), endedAt: null }] },
      { entityId: 'line-2', telemetryHistory: makeTelemetry(20, start + 5000), irrigationHistory: [] },
    ];
    const { examples, readiness } = buildDatasetFromBridged(bridged, { stride: 1 });
    expect(readiness.perEntity.length).toBe(2);
    expect(readiness.totalLabeledExamples).toBe(examples.length);
    expect(readiness.positiveExamples + readiness.negativeExamples).toBe(examples.length);
    for (let i = 1; i < examples.length; i++) {
      expect(examples[i].asOf.getTime()).toBeGreaterThanOrEqual(examples[i - 1].asOf.getTime());
    }
  });

  test('reports classBalance null rather than fabricating a ratio when there are zero examples', () => {
    const { readiness } = buildDatasetFromBridged([{ entityId: 'empty', telemetryHistory: [], irrigationHistory: [] }], { stride: 1 });
    expect(readiness.totalLabeledExamples).toBe(0);
    expect(readiness.classBalance).toBeNull();
  });
});
