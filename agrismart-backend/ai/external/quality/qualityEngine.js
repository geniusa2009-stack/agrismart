'use strict';

/**
 * ai/external/quality/qualityEngine.js
 *
 * Automated data-quality report over a set of canonical records
 * (ideally for a single dataset+entity). Produces a machine-readable
 * report classifying issues INFO/WARNING/ERROR/CRITICAL. Never
 * "fixes" anything itself — this module only observes and reports;
 * any correction is a separate, explicit, documented step.
 */

const { findDuplicateTimestamps, findTemporalGaps } = require('../normalization/temporal');

const PLAUSIBLE_RANGES = {
  soilMoisture: [0, 100],
  soilTemperature: [-10, 60],
  airTemperature: [-40, 55],
  relativeHumidity: [0, 100],
  precipitation: [0, 500], // mm per reading — generous upper bound for a single interval
  soilEc: [0, 20],
};

function severity(level, code, message, context = {}) {
  return { level, code, message, context };
}

/**
 * @param {Array} records - canonical records for ONE dataset+entity, in any order (sorted internally)
 * @param {object} opts
 * @param {number} [opts.expectedIntervalMs] - if known, enables gap detection
 * @param {number} [opts.flatlineWindow=6] - consecutive identical non-null readings considered a flatline
 */
function runQualityChecks(records, { expectedIntervalMs = null, flatlineWindow = 6 } = {}) {
  const findings = [];
  if (records.length === 0) {
    return { findings: [severity('CRITICAL', 'EMPTY_DATASET', 'No records to evaluate.')], summary: { recordCount: 0 } };
  }

  const sorted = records.slice().sort((a, b) => a.timestamp - b.timestamp);

  // Missing values per field.
  const fields = ['soilMoisture', 'soilTemperature', 'soilEc', 'soilSalinity', 'airTemperature', 'relativeHumidity', 'precipitation'];
  for (const field of fields) {
    const total = sorted.length;
    const missing = sorted.filter((r) => r[field] === null || r[field] === undefined).length;
    const missingFraction = missing / total;
    if (missing === total) {
      findings.push(severity('INFO', 'FIELD_ENTIRELY_ABSENT', `Field "${field}" is absent from every record — this dataset does not report it.`, { field }));
    } else if (missingFraction > 0.3) {
      findings.push(severity('WARNING', 'HIGH_MISSING_RATE', `Field "${field}" is missing in ${(missingFraction * 100).toFixed(1)}% of records.`, { field, missingFraction }));
    }
  }

  // Impossible values.
  for (const [field, [min, max]] of Object.entries(PLAUSIBLE_RANGES)) {
    for (const r of sorted) {
      const v = r[field];
      if (v !== null && v !== undefined && (v < min || v > max)) {
        findings.push(severity('ERROR', 'IMPOSSIBLE_VALUE', `${field}=${v} at ${r.timestamp.toISOString()} is outside the plausible range [${min}, ${max}].`, { field, value: v, timestamp: r.timestamp }));
      }
    }
  }

  // Duplicate timestamps (per fieldId as entity key).
  const duplicates = findDuplicateTimestamps(sorted, { timestampKey: 'timestamp', entityKey: 'fieldId' });
  if (duplicates.length > 0) {
    findings.push(severity('WARNING', 'DUPLICATE_TIMESTAMPS', `${duplicates.length} duplicate (entity, timestamp) pair(s) found.`, { count: duplicates.length }));
  }

  // Temporal gaps.
  if (expectedIntervalMs) {
    const gaps = findTemporalGaps(sorted.map((r) => r.timestamp), expectedIntervalMs);
    if (gaps.length > 0) {
      const worst = gaps.reduce((a, b) => (b.gapMs > a.gapMs ? b : a));
      findings.push(
        severity(
          gaps.length > sorted.length * 0.1 ? 'ERROR' : 'WARNING',
          'TEMPORAL_GAPS',
          `${gaps.length} gap(s) larger than expected sampling interval; largest gap ${(worst.gapMs / (60 * 60 * 1000)).toFixed(1)}h.`,
          { count: gaps.length, largestGapMs: worst.gapMs }
        )
      );
    }
  }

  // Flatlined sensors: N consecutive identical non-null readings.
  for (const field of ['soilMoisture', 'soilTemperature']) {
    let run = 1;
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1][field];
      const cur = sorted[i][field];
      if (prev !== null && cur !== null && prev === cur) {
        run += 1;
        if (run === flatlineWindow) {
          findings.push(severity('WARNING', 'SENSOR_FLATLINE', `"${field}" reported the identical value (${cur}) for ${run} consecutive readings ending ${sorted[i].timestamp.toISOString()}.`, { field, value: cur }));
        }
      } else {
        run = 1;
      }
    }
  }

  // Sudden spikes: |delta| implausibly large between consecutive readings for a physically slow-changing variable.
  const SPIKE_THRESHOLDS = { soilMoisture: 25, soilTemperature: 8 };
  for (const [field, threshold] of Object.entries(SPIKE_THRESHOLDS)) {
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1][field];
      const cur = sorted[i][field];
      if (prev !== null && cur !== null && Math.abs(cur - prev) > threshold) {
        findings.push(severity('WARNING', 'SENSOR_SPIKE', `"${field}" jumped by ${(cur - prev).toFixed(1)} between consecutive readings at ${sorted[i].timestamp.toISOString()}.`, { field, delta: cur - prev, timestamp: sorted[i].timestamp }));
      }
    }
  }

  // Impossible irrigation durations.
  for (const r of sorted) {
    if (r.irrigationDurationSeconds !== null && (r.irrigationDurationSeconds < 0 || r.irrigationDurationSeconds > 24 * 60 * 60)) {
      findings.push(severity('ERROR', 'IMPOSSIBLE_IRRIGATION_DURATION', `irrigationDurationSeconds=${r.irrigationDurationSeconds} at ${r.timestamp.toISOString()} is implausible.`, { value: r.irrigationDurationSeconds }));
    }
  }

  const summary = {
    recordCount: sorted.length,
    timeRange: { from: sorted[0].timestamp, to: sorted[sorted.length - 1].timestamp },
    critical: findings.filter((f) => f.level === 'CRITICAL').length,
    errors: findings.filter((f) => f.level === 'ERROR').length,
    warnings: findings.filter((f) => f.level === 'WARNING').length,
    info: findings.filter((f) => f.level === 'INFO').length,
  };

  return { findings, summary };
}

module.exports = { runQualityChecks };
