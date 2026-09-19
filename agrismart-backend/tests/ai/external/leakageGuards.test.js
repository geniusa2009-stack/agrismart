'use strict';

const {
  LeakageError,
  assertNoFutureFeatureTime,
  assertNoOverlapBetweenSplits,
  scanForSuspiciousLabelCorrelation,
  assertNoPostEventMeasurementAsFeature,
} = require('../../../ai/external/leakage/leakageGuards');

describe('ai/external/leakage/leakageGuards (fail loud, not warn-and-continue)', () => {
  test('assertNoFutureFeatureTime throws when a feature was computed using data after asOf', () => {
    const examples = [{ asOf: new Date('2026-01-01T00:00:00Z'), featureComputedThroughTimestamp: new Date('2026-01-01T01:00:00Z') }];
    expect(() => assertNoFutureFeatureTime(examples)).toThrow(LeakageError);
  });

  test('assertNoFutureFeatureTime passes silently for valid examples', () => {
    const examples = [{ asOf: new Date('2026-01-01T01:00:00Z'), featureComputedThroughTimestamp: new Date('2026-01-01T00:00:00Z') }];
    expect(() => assertNoFutureFeatureTime(examples)).not.toThrow();
  });

  test('assertNoOverlapBetweenSplits throws on a duplicate (entity, timestamp) across train/test', () => {
    const shared = new Date('2026-01-01T00:00:00Z');
    const train = [{ deviceId: 'd1', asOf: shared }];
    const test = [{ deviceId: 'd1', asOf: shared }];
    expect(() => assertNoOverlapBetweenSplits(train, test)).toThrow(LeakageError);
  });

  test('assertNoOverlapBetweenSplits throws when train time range is not strictly before test time range', () => {
    const train = [{ deviceId: 'd1', asOf: new Date('2026-01-02T00:00:00Z') }];
    const test = [{ deviceId: 'd1', asOf: new Date('2026-01-01T00:00:00Z') }];
    expect(() => assertNoOverlapBetweenSplits(train, test)).toThrow(LeakageError);
  });

  test('assertNoOverlapBetweenSplits passes for a genuinely chronological, non-overlapping split', () => {
    const train = [{ deviceId: 'd1', asOf: new Date('2026-01-01T00:00:00Z') }];
    const test = [{ deviceId: 'd1', asOf: new Date('2026-01-02T00:00:00Z') }];
    expect(() => assertNoOverlapBetweenSplits(train, test)).not.toThrow();
  });

  test('scanForSuspiciousLabelCorrelation flags a near-perfectly-correlated feature (likely target leakage)', () => {
    const n = 50;
    const labels = Array.from({ length: n }, (_, i) => i % 2);
    const featureRows = labels.map((y) => [y]); // feature IS the label — obvious leakage
    const suspicious = scanForSuspiciousLabelCorrelation(featureRows, labels, ['suspiciousFeature']);
    expect(suspicious.some((s) => s.feature === 'suspiciousFeature')).toBe(true);
  });

  test('scanForSuspiciousLabelCorrelation does not flag an unrelated random feature', () => {
    const n = 50;
    const labels = Array.from({ length: n }, (_, i) => i % 2);
    const featureRows = labels.map(() => [Math.random()]);
    const suspicious = scanForSuspiciousLabelCorrelation(featureRows, labels, ['randomFeature']);
    expect(suspicious.length).toBe(0);
  });

  test('assertNoPostEventMeasurementAsFeature throws when asOf falls inside an irrigation event window', () => {
    const events = [{ startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: new Date('2026-01-01T01:00:00Z'), asOf: new Date('2026-01-01T00:30:00Z') }];
    expect(() => assertNoPostEventMeasurementAsFeature(events)).toThrow(LeakageError);
  });
});
