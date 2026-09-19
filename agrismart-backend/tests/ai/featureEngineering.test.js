'use strict';

const { computeFeatures, computeLabel } = require('../../ai/features/featureEngineering');
const { FEATURE_NAMES } = require('../../ai/features/featureVersion');

function reading(minutesAgoFromBase, base, moisture, extras = {}) {
  return {
    recordedAt: new Date(base.getTime() - minutesAgoFromBase * 60 * 1000),
    readings: { soilMoisturePercent: moisture, temperatureCelsius: 25, soilSalinityPpt: 1.2, ...extras },
  };
}

describe('ai/features/featureEngineering', () => {
  const base = new Date('2026-01-01T12:00:00Z');

  test('produces every declared feature name, defaulting missing ones to null', () => {
    const history = [reading(0, base, 40)];
    const { features, featureVersion } = computeFeatures(history, [], base);
    expect(typeof featureVersion).toBe('string');
    for (const name of FEATURE_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(features, name)).toBe(true);
    }
    expect(features.soilMoisturePercent).toBe(40);
    expect(features.soilMoistureLag1h).toBeNull();
  });

  test('does not leak future telemetry into features (no data after asOf may change the output)', () => {
    const history = [reading(120, base, 50), reading(60, base, 45), reading(0, base, 40)];
    const withoutFuture = computeFeatures(history, [], base);

    const historyWithFuture = history.concat([
      { recordedAt: new Date(base.getTime() + 60 * 60 * 1000), readings: { soilMoisturePercent: 5, temperatureCelsius: 40, soilSalinityPpt: 3 } },
    ]);
    const withFuture = computeFeatures(historyWithFuture, [], base);

    expect(withFuture.features).toEqual(withoutFuture.features);
  });

  test('computeLabel looks strictly forward and returns null when there is no future data yet', () => {
    const history = [reading(0, base, 40)];
    expect(computeLabel(history, base, 3 * 60 * 60 * 1000, 30)).toBeNull();
  });

  test('computeLabel detects a future crossing below threshold within the horizon', () => {
    const history = [
      reading(0, base, 40),
      { recordedAt: new Date(base.getTime() + 60 * 60 * 1000), readings: { soilMoisturePercent: 25, temperatureCelsius: 25, soilSalinityPpt: 1.2 } },
    ];
    expect(computeLabel(history, base, 3 * 60 * 60 * 1000, 30)).toBe(true);
  });

  test('computeLabel returns false when future data exists but never crosses the threshold', () => {
    const history = [
      reading(0, base, 40),
      { recordedAt: new Date(base.getTime() + 60 * 60 * 1000), readings: { soilMoisturePercent: 38, temperatureCelsius: 25, soilSalinityPpt: 1.2 } },
      { recordedAt: new Date(base.getTime() + 3 * 60 * 60 * 1000), readings: { soilMoisturePercent: 35, temperatureCelsius: 25, soilSalinityPpt: 1.2 } },
    ];
    expect(computeLabel(history, base, 3 * 60 * 60 * 1000, 30)).toBe(false);
  });

  test('handles missing telemetry (empty history) without throwing', () => {
    const { features } = computeFeatures([], [], base);
    expect(features.soilMoisturePercent).toBeNull();
  });

  test('ignores invalid/out-of-range readings supplied to it (caller validated upstream) rather than crashing', () => {
    const history = [{ recordedAt: base, readings: {} }];
    expect(() => computeFeatures(history, [], base)).not.toThrow();
  });
});
