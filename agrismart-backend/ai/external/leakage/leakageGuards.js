'use strict';

/**
 * ai/external/leakage/leakageGuards.js
 *
 * Leakage prevention as a first-class, FAIL-LOUD feature (spec:
 * "the benchmark must fail loudly if obvious temporal leakage is
 * detected"). Every guard here throws (LeakageError), it never just
 * logs a warning — a benchmark run that ignores a thrown LeakageError
 * is a bug in the caller, not a valid way to silence this.
 */

class LeakageError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'LeakageError';
    this.details = details;
  }
}

/** Every example's features must be computed from data at/before asOf. */
function assertNoFutureFeatureTime(examples, { asOfKey = 'asOf', featureComputedAtKey = 'featureComputedThroughTimestamp' } = {}) {
  for (const ex of examples) {
    const asOf = ex[asOfKey];
    const featureThrough = ex[featureComputedAtKey];
    if (featureThrough && asOf && new Date(featureThrough).getTime() > new Date(asOf).getTime()) {
      throw new LeakageError(
        `Example at asOf=${new Date(asOf).toISOString()} used feature data through ${new Date(featureThrough).toISOString()}, which is in the future relative to asOf.`,
        { asOf, featureThrough }
      );
    }
  }
}

/**
 * Train and test splits must not share ANY timestamp for the same
 * entity (deviceId/fieldId) — the "same-event leakage" / "duplicate
 * records across splits" requirement. Also fails if train's latest
 * timestamp is >= test's earliest timestamp for chronological splits.
 */
function assertNoOverlapBetweenSplits(trainExamples, testExamples, { timestampKey = 'asOf', entityKey = 'deviceId', requireChronological = true } = {}) {
  const trainKeys = new Set(trainExamples.map((e) => `${e[entityKey]}|${new Date(e[timestampKey]).getTime()}`));
  for (const ex of testExamples) {
    const key = `${ex[entityKey]}|${new Date(ex[timestampKey]).getTime()}`;
    if (trainKeys.has(key)) {
      throw new LeakageError(`Test example (entity=${ex[entityKey]}, timestamp=${new Date(ex[timestampKey]).toISOString()}) also appears in the training split.`, { entity: ex[entityKey], timestamp: ex[timestampKey] });
    }
  }

  if (requireChronological && trainExamples.length && testExamples.length) {
    const trainMax = Math.max(...trainExamples.map((e) => new Date(e[timestampKey]).getTime()));
    const testMin = Math.min(...testExamples.map((e) => new Date(e[timestampKey]).getTime()));
    if (trainMax >= testMin) {
      throw new LeakageError(
        `Train split's latest timestamp (${new Date(trainMax).toISOString()}) is not strictly before test split's earliest timestamp (${new Date(testMin).toISOString()}) — the same time period appears in both splits.`,
        { trainMax, testMin }
      );
    }
  }
}

/**
 * Detects a feature that is a deterministic (or near-deterministic)
 * function of the label itself — a common accidental-leakage pattern
 * ("target-derived features", e.g. a "moisture_after_irrigation" field
 * accidentally used to predict "will need irrigation"). Flags any
 * feature whose correlation with the label exceeds `threshold` as
 * suspicious — this is a heuristic screen, not proof, so it reports
 * rather than throws by default.
 */
function scanForSuspiciousLabelCorrelation(featureRows, labels, featureNames, { threshold = 0.98 } = {}) {
  const suspicious = [];
  const n = labels.length;
  if (n < 10) return suspicious; // not enough samples for a meaningful correlation

  for (let j = 0; j < featureNames.length; j += 1) {
    const values = featureRows.map((row) => row[j]).filter((v) => v !== null && Number.isFinite(v));
    if (values.length < n * 0.5) continue; // too sparse to judge

    const paired = featureRows.map((row, i) => [row[j], labels[i]]).filter(([v]) => v !== null && Number.isFinite(v));
    const xs = paired.map((p) => p[0]);
    const ys = paired.map((p) => p[1]);
    const corr = pearsonCorrelation(xs, ys);
    if (Math.abs(corr) >= threshold) {
      suspicious.push({ feature: featureNames[j], correlation: corr });
    }
  }
  return suspicious;
}

function pearsonCorrelation(xs, ys) {
  const n = xs.length;
  if (n === 0) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

/** Same-event leakage: a post-irrigation measurement accidentally used as a predictor for the same irrigation decision. */
function assertNoPostEventMeasurementAsFeature(events, { eventStartKey = 'startedAt', eventEndKey = 'endedAt', featureAsOfKey = 'asOf' } = {}) {
  for (const ev of events) {
    if (!ev[eventEndKey]) continue;
    const asOf = new Date(ev[featureAsOfKey] ?? ev[eventStartKey]);
    const end = new Date(ev[eventEndKey]);
    if (asOf.getTime() > new Date(ev[eventStartKey]).getTime() && asOf.getTime() < end.getTime()) {
      throw new LeakageError(`A feature's asOf (${asOf.toISOString()}) falls INSIDE an irrigation event's active window (${new Date(ev[eventStartKey]).toISOString()} - ${end.toISOString()}) — this measurement is a post-event/mid-event reading, not a pre-decision one.`, { event: ev });
    }
  }
}

module.exports = {
  LeakageError,
  assertNoFutureFeatureTime,
  assertNoOverlapBetweenSplits,
  scanForSuspiciousLabelCorrelation,
  assertNoPostEventMeasurementAsFeature,
};
