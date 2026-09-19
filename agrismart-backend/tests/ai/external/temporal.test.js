'use strict';

const { parseTimestamp, findDuplicateTimestamps, findTemporalGaps, resampleLastObservationCarriedForward } = require('../../../ai/external/normalization/temporal');

describe('ai/external/normalization/temporal', () => {
  test('parseTimestamp preserves the original string alongside the parsed Date', () => {
    const result = parseTimestamp('2026-05-01T00:00:00Z');
    expect(result.original).toBe('2026-05-01T00:00:00Z');
    expect(result.parsed.getUTCFullYear()).toBe(2026);
    expect(result.assumedOffsetApplied).toBe(false);
  });

  test('parseTimestamp applies and records an assumed offset only when explicitly given', () => {
    const result = parseTimestamp('2026-05-01 00:00', { assumedTimezoneOffsetMinutes: 120 });
    expect(result.assumedOffsetApplied).toBe(true);
    // 00:00 local (UTC+2) -> 2026-04-30T22:00:00Z
    expect(result.parsed.toISOString()).toBe('2026-04-30T22:00:00.000Z');
  });

  test('findDuplicateTimestamps detects same-entity duplicate timestamps without dropping them', () => {
    const records = [
      { deviceId: 'a', timestamp: new Date('2026-01-01T00:00:00Z') },
      { deviceId: 'a', timestamp: new Date('2026-01-01T00:00:00Z') },
      { deviceId: 'b', timestamp: new Date('2026-01-01T00:00:00Z') },
    ];
    const dupes = findDuplicateTimestamps(records);
    expect(dupes.length).toBe(1);
  });

  test('findTemporalGaps flags a gap larger than tolerance without filling it', () => {
    const timestamps = [new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:15:00Z'), new Date('2026-01-02T00:15:00Z')];
    const gaps = findTemporalGaps(timestamps, 15 * 60 * 1000);
    expect(gaps.length).toBe(1);
    expect(gaps[0].gapMs).toBeGreaterThan(23 * 60 * 60 * 1000);
  });

  test('resampleLastObservationCarriedForward never carries forward past maxCarryForwardMs (no leakage into a distant future slot)', () => {
    const points = [
      { timestamp: new Date('2026-01-01T00:00:00Z'), value: 10 },
      { timestamp: new Date('2026-01-01T03:00:00Z'), value: 20 },
    ];
    const resampled = resampleLastObservationCarriedForward(points, 60 * 60 * 1000, 90 * 60 * 1000);
    // At 01:00 and 02:00, the last observation (00:00, age 60-120min) is beyond a 90-min carry-forward for the 02:00 slot.
    const at2 = resampled.find((p) => p.timestamp.toISOString() === '2026-01-01T02:00:00.000Z');
    expect(at2.value).toBeNull();
  });
});
