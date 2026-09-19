'use strict';

const { computeIrrigationEventLabel } = require('../../../ai/features/irrigationEventLabel');

const HOUR_MS = 60 * 60 * 1000;

describe('computeIrrigationEventLabel — leak-free onset label', () => {
  test('returns null when the window is not fully observed (honest "unknown", never fabricated as false)', () => {
    const asOf = new Date('2024-07-01T00:00:00.000Z');
    const observedThroughMs = asOf.getTime() + 30 * 60 * 1000; // only observed 30 min into a 1h window
    const label = computeIrrigationEventLabel([], asOf, HOUR_MS, observedThroughMs);
    expect(label).toBeNull();
  });

  test('returns true when a new event starts strictly within (asOf, asOf+horizon]', () => {
    const asOf = new Date('2024-07-01T00:00:00.000Z');
    const observedThroughMs = asOf.getTime() + HOUR_MS;
    const irrigationHistory = [{ startedAt: new Date(asOf.getTime() + 20 * 60 * 1000), endedAt: null }];
    expect(computeIrrigationEventLabel(irrigationHistory, asOf, HOUR_MS, observedThroughMs)).toBe(true);
  });

  test('returns false when the window is fully observed and no event starts within it', () => {
    const asOf = new Date('2024-07-01T00:00:00.000Z');
    const observedThroughMs = asOf.getTime() + HOUR_MS;
    const irrigationHistory = [{ startedAt: new Date(asOf.getTime() - 10 * 60 * 1000), endedAt: null }]; // started BEFORE asOf — not a new onset
    expect(computeIrrigationEventLabel(irrigationHistory, asOf, HOUR_MS, observedThroughMs)).toBe(false);
  });

  test('an event that started before asOf and is still open does NOT count as a new onset (onset, not persistence)', () => {
    const asOf = new Date('2024-07-01T00:00:00.000Z');
    const observedThroughMs = asOf.getTime() + HOUR_MS;
    const irrigationHistory = [{ startedAt: new Date(asOf.getTime() - HOUR_MS), endedAt: null }];
    expect(computeIrrigationEventLabel(irrigationHistory, asOf, HOUR_MS, observedThroughMs)).toBe(false);
  });

  test('an event starting exactly at the horizon boundary counts (inclusive upper bound)', () => {
    const asOf = new Date('2024-07-01T00:00:00.000Z');
    const observedThroughMs = asOf.getTime() + HOUR_MS;
    const irrigationHistory = [{ startedAt: new Date(asOf.getTime() + HOUR_MS), endedAt: null }];
    expect(computeIrrigationEventLabel(irrigationHistory, asOf, HOUR_MS, observedThroughMs)).toBe(true);
  });

  test('an event starting exactly at asOf does NOT count (must be strictly after asOf)', () => {
    const asOf = new Date('2024-07-01T00:00:00.000Z');
    const observedThroughMs = asOf.getTime() + HOUR_MS;
    const irrigationHistory = [{ startedAt: new Date(asOf.getTime()), endedAt: null }];
    expect(computeIrrigationEventLabel(irrigationHistory, asOf, HOUR_MS, observedThroughMs)).toBe(false);
  });
});
