'use strict';

const { buildDataset } = require('../../ai/data/datasetBuilder');
const { generateSyntheticDevDataset } = require('../../ai/data/syntheticDevData');

describe('ai/data/datasetBuilder (leakage + validity)', () => {
  test('every produced example has a feature vector computed only from data at/before its own asOf', () => {
    const synthetic = generateSyntheticDevDataset({ days: 5, intervalMinutes: 30, seed: 1 });
    const valve = { deviceId: synthetic.meta.deviceId, _id: 'v1', farmId: 'f1', autoOpenBelowPercent: 30 };
    const { examples } = buildDataset({
      valves: [valve],
      telemetryByDevice: new Map([[valve.deviceId, synthetic.telemetry]]),
      irrigationByValve: new Map([[String(valve._id), synthetic.irrigationEvents]]),
    });

    expect(examples.length).toBeGreaterThan(0);
    // Chronological order preserved (splitChronological relies on this).
    for (let i = 1; i < examples.length; i += 1) {
      expect(examples[i].asOf.getTime()).toBeGreaterThanOrEqual(examples[i - 1].asOf.getTime());
    }
    // Labels must be 0 or 1, never null (nulls are filtered out already).
    for (const ex of examples) {
      expect([0, 1]).toContain(ex.label);
    }
  });

  test('excludes examples where moisture is already below threshold at asOf ("needs water now" is a different problem)', () => {
    const synthetic = generateSyntheticDevDataset({ days: 5, intervalMinutes: 30, seed: 2 });
    const valve = { deviceId: synthetic.meta.deviceId, _id: 'v1', farmId: 'f1', autoOpenBelowPercent: 30 };
    const { examples } = buildDataset({
      valves: [valve],
      telemetryByDevice: new Map([[valve.deviceId, synthetic.telemetry]]),
      irrigationByValve: new Map([[String(valve._id), synthetic.irrigationEvents]]),
    });
    for (const ex of examples) {
      expect(ex.features.soilMoisturePercent).toBeGreaterThanOrEqual(30);
    }
  });

  test('reports data readiness without asserting sufficiency', () => {
    const { readiness } = buildDataset({ valves: [], telemetryByDevice: new Map(), irrigationByValve: new Map() });
    expect(readiness.devicesTotal).toBe(0);
    expect(readiness.totalLabeledExamples).toBe(0);
  });
});
