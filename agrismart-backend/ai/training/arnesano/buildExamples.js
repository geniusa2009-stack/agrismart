'use strict';

/**
 * ai/training/arnesano/buildExamples.js
 *
 * Builds leak-free, TRUE-24h-horizon labeled examples for one
 * Arnesano zone from the adapter's per-row (gap-preserving) canonical
 * record array. See arnesanoCsvAdapter.js's header comment and
 * AI_DATA_QUALITY_REPORT.md for why this project rebuilds the target
 * from the merged layer by exact row-index offset (+144 rows = +24h
 * on this dataset's verified-regular 10-minute grid) instead of
 * trusting the dataset's own published "24-hour" column, which this
 * project's forensic audit found is frequently NOT actually 24 hours
 * ahead (rows with missing readings are dropped in that published
 * column, silently stretching the real horizon).
 *
 * Leak-free by construction:
 *  - Every FEATURE at row i uses only that row's own concurrent
 *    weather/soil/irrigation state, or a BACKWARD-looking window
 *    (waterLitersPast4h sums the preceding 24 steps) — never a value
 *    from after row i.
 *  - The LABEL is soilMoisture at row i+144 — strictly future
 *    relative to row i — and is only used when that exact future row
 *    has a valid (non-null) soilMoisture reading; otherwise the
 *    example is skipped (never imputed/fabricated).
 *  - A defensive timestamp check asserts the row i+144 is really
 *    exactly 24h after row i (should always hold on this dataset's
 *    verified-regular grid; if it ever doesn't, the example is
 *    skipped and counted rather than silently mislabeled).
 */

const HOUR_MS = 60 * 60 * 1000;
const HORIZON_STEPS = 144; // 144 x 10-minute steps = 24h on this dataset's regular grid
const HORIZON_MS = 24 * HOUR_MS;
const PAST_WATER_STEPS = 24; // 24 x 10-minute steps = 4h, backward-looking only

function buildExamplesForZone(records, { entityId }) {
  const examples = [];
  let skippedNoCurrentReading = 0;
  let skippedNoFutureReading = 0;
  let skippedGridGapAnomaly = 0;

  // Precompute a rolling backward sum of liters applied over the
  // preceding PAST_WATER_STEPS bins (safe: strictly backward-looking).
  const waterPast4h = new Array(records.length).fill(null);
  let windowSum = 0;
  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i];
    const liters = rec && rec.waterVolumeLiters !== null ? rec.waterVolumeLiters : 0;
    windowSum += liters;
    if (i >= PAST_WATER_STEPS) {
      const dropped = records[i - PAST_WATER_STEPS];
      windowSum -= dropped && dropped.waterVolumeLiters !== null ? dropped.waterVolumeLiters : 0;
    }
    waterPast4h[i] = i >= PAST_WATER_STEPS - 1 ? windowSum : null; // null until a full 4h window is observed
  }

  for (let i = 0; i + HORIZON_STEPS < records.length; i += 1) {
    const current = records[i];
    const future = records[i + HORIZON_STEPS];
    if (!current || current.soilMoisture === null) {
      skippedNoCurrentReading += 1;
      continue;
    }
    if (!future || future.soilMoisture === null) {
      skippedNoFutureReading += 1;
      continue;
    }
    const gapMs = future.timestamp.getTime() - current.timestamp.getTime();
    if (gapMs !== HORIZON_MS) {
      skippedGridGapAnomaly += 1;
      continue;
    }
    if (waterPast4h[i] === null) {
      continue; // not enough history yet for the backward water feature
    }

    const asOf = current.timestamp;
    const features = {
      airTemperature: current.airTemperature,
      relativeHumidity: current.relativeHumidity,
      precipitation: current.precipitation,
      solarRadiation: current.solarRadiation,
      windSpeed: current.windSpeed,
      soilTemperature0to7cm: current._soilTemperature0to7cm,
      soilTemperature7to18cm: current._soilTemperature7to18cm,
      soilEc: current.soilEc,
      soilPh: current.soilPh,
      soilMoisture: current.soilMoisture,
      irrigationDurationSecondsCurrentBin: current.irrigationDurationSeconds,
      waterLitersPast4h: waterPast4h[i],
      hourOfDay: asOf.getUTCHours(),
      dayOfWeek: asOf.getUTCDay(),
      month: asOf.getUTCMonth() + 1,
    };

    examples.push({ entityId, asOf, features, label: future.soilMoisture });
  }

  return { examples, skippedNoCurrentReading, skippedNoFutureReading, skippedGridGapAnomaly };
}

module.exports = { buildExamplesForZone, HORIZON_STEPS, HORIZON_MS, PAST_WATER_STEPS };
