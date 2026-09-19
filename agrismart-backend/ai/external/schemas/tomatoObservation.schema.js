'use strict';

/**
 * ai/external/schemas/tomatoObservation.schema.js
 *
 * Canonical schema for the Mendeley "Dataset on irrigation for
 * Tomato" (DOI 10.17632/33cngpcrmx.2) and any structurally similar
 * cross-sectional agronomic sensor dataset.
 *
 * This is DELIBERATELY a separate schema from
 * ai/external/schemas/canonicalRecord.schema.js, not a forced fit
 * into it. The canonical time-series schema requires a real
 * `timestamp` (z.coerce.date(), not nullable/optional) because it
 * models per-device telemetry streams with irrigation events. This
 * dataset has:
 *   - no wall-clock timestamp of any kind (no date/time column),
 *   - no device/farm/field identifier,
 *   - no irrigation on/off signal or valve state.
 * Fabricating any of those to satisfy the other schema would violate
 * the project's core rule against inventing data that does not exist.
 * Instead this schema honestly represents what the file actually is:
 * a sequence of concurrent agronomic/environmental observations from a
 * single greenhouse tomato trial, ordered by "Days of planted" (an
 * ordinal day-since-planting count, not a calendar timestamp) rather
 * than by clock time.
 */

const { z } = require('zod');

const CROP_STAGES = ['Initial Stage', 'Development Stage', 'Mid stage', 'Last stage'];

const TomatoObservationSchema = z.object({
  // Ordinal position of this row within the source CSV (0-based). NOT
  // a timestamp — recorded so a "chronological-by-file-order" split
  // can be verified/reconstructed, and so duplicate detection can
  // reference an exact source row.
  rowIndex: z.number().int().nonnegative(),

  // The dataset's own coarse time axis: whole days since the crop was
  // planted. Monotonic non-decreasing across the file as delivered
  // (verified during ingestion, not assumed). This is the only
  // temporal ordering this dataset supports.
  daysSincePlanting: z.number().int().nonnegative(),

  cropStage: z.enum(CROP_STAGES),

  // One constant identifier for the whole file: the dataset describes
  // a single automated drip-irrigation greenhouse trial, not multiple
  // farms/fields/devices. This field exists purely so the existing
  // leakage-guard helpers (which key on an "entity") have something to
  // group on; it is not a real multi-site identifier.
  trialId: z.literal('mendeley-tomato-irrigation-trial'),

  airTemperatureCelsius: z.number(),
  relativeHumidityPercent: z.number(),
  soilMoistureRaw: z.number(), // unit NOT specified by the source — see provenance.originalUnits; do not assume % or any other unit
  referenceEvapotranspiration: z.number(), // ET0, source unit unspecified/non-standard — see provenance note
  evapotranspiration: z.number(), // ETc/ET, source unit unspecified/non-standard — see provenance note
  cropCoefficient: z.number(), // Kc
  soilNitrogenMgPerKg: z.number(),
  soilPhosphorusMgPerKg: z.number(),
  soilPotassiumMgPerKg: z.number(),
  solarRadiationWPerM2: z.number(),
  windSpeedMPerS: z.number(),
  soilPh: z.number(),

  source: z.literal('external'),
  datasetId: z.string().min(1),
});

module.exports = { TomatoObservationSchema, CROP_STAGES };
