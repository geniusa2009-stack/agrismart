'use strict';

/**
 * ai/external/normalization/temporal.js
 *
 * Timestamp parsing, timezone normalization, duplicate/gap detection.
 * Every function here PRESERVES the original timestamp string
 * alongside its parsed Date — nothing here is allowed to silently
 * discard what the source file actually said.
 */

/**
 * Parses a timestamp that may or may not carry an explicit UTC offset.
 * When `assumedTimezoneOffsetMinutes` is given and the string has no
 * offset of its own, that offset is applied EXPLICITLY (recorded in
 * the returned object) rather than silently assumed by the JS Date
 * constructor (which would assume the server/environment's local
 * time zone — never correct for externally-sourced data).
 */
function parseTimestamp(raw, { assumedTimezoneOffsetMinutes = 0 } = {}) {
  if (!raw) return { original: raw, parsed: null, assumedOffsetApplied: false };

  const hasExplicitOffset = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(String(raw).trim());
  if (hasExplicitOffset) {
    const d = new Date(raw);
    return { original: raw, parsed: Number.isNaN(d.getTime()) ? null : d, assumedOffsetApplied: false };
  }

  // No explicit offset in the source string: parse as if it were UTC,
  // then shift by the assumed offset (so "local farm time" strings can
  // be normalized without pretending we detected a timezone that isn't
  // actually in the data).
  const naiveUtc = new Date(`${String(raw).trim().replace(' ', 'T')}Z`);
  if (Number.isNaN(naiveUtc.getTime())) {
    return { original: raw, parsed: null, assumedOffsetApplied: false };
  }
  const adjusted = new Date(naiveUtc.getTime() - assumedTimezoneOffsetMinutes * 60 * 1000);
  return { original: raw, parsed: adjusted, assumedOffsetApplied: assumedTimezoneOffsetMinutes !== 0 };
}

/** Detects exact-duplicate timestamps for the same entity (deviceId/site). Never silently drops one — returns them for the caller to decide. */
function findDuplicateTimestamps(records, { timestampKey = 'timestamp', entityKey = 'deviceId' } = {}) {
  const seen = new Map();
  const duplicates = [];
  for (const record of records) {
    const key = `${record[entityKey]}|${new Date(record[timestampKey]).getTime()}`;
    if (seen.has(key)) {
      duplicates.push({ first: seen.get(key), duplicate: record });
    } else {
      seen.set(key, record);
    }
  }
  return duplicates;
}

/**
 * Finds gaps in a chronologically-sorted series larger than
 * `expectedIntervalMs * toleranceFactor`. Returns the gaps, never
 * fills them — filling a temporal gap with an interpolated value
 * would be exactly the kind of fabrication this subsystem forbids
 * unless the caller explicitly asks for (and labels) an imputation
 * step downstream.
 */
function findTemporalGaps(sortedTimestamps, expectedIntervalMs, { toleranceFactor = 2 } = {}) {
  const gaps = [];
  for (let i = 1; i < sortedTimestamps.length; i += 1) {
    const delta = sortedTimestamps[i].getTime() - sortedTimestamps[i - 1].getTime();
    if (delta > expectedIntervalMs * toleranceFactor) {
      gaps.push({ from: sortedTimestamps[i - 1], to: sortedTimestamps[i], gapMs: delta });
    }
  }
  return gaps;
}

/**
 * Resamples ascending (timestamp, value) pairs onto a fixed interval
 * using ONLY backward-looking data (last observation carried forward
 * within `maxCarryForwardMs`) — never a centered or forward-looking
 * interpolation, which would leak future information into a
 * resampled series used for features.
 */
function resampleLastObservationCarriedForward(points, intervalMs, maxCarryForwardMs) {
  if (points.length === 0) return [];
  const start = points[0].timestamp.getTime();
  const end = points[points.length - 1].timestamp.getTime();
  const out = [];
  let idx = 0;
  for (let t = start; t <= end; t += intervalMs) {
    while (idx + 1 < points.length && points[idx + 1].timestamp.getTime() <= t) idx += 1;
    const candidate = points[idx];
    const age = t - candidate.timestamp.getTime();
    out.push({ timestamp: new Date(t), value: age <= maxCarryForwardMs && candidate.timestamp.getTime() <= t ? candidate.value : null });
  }
  return out;
}

module.exports = { parseTimestamp, findDuplicateTimestamps, findTemporalGaps, resampleLastObservationCarriedForward };
