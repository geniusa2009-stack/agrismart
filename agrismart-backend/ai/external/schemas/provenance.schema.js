'use strict';

/**
 * ai/external/schemas/provenance.schema.js
 *
 * Required metadata for every external dataset adapter. `ingested`
 * is the single most important field in this whole subsystem: it is
 * the difference between "this adapter's code has been validated
 * against real bytes of this dataset" (true) and "this adapter has
 * only been run against a structural fixture" (false). Every
 * downstream report (quality, benchmark, cross-dataset) reads this
 * flag before describing a result as real.
 */

const { z } = require('zod');

const ProvenanceSchema = z.object({
  datasetId: z.string().min(1),
  datasetName: z.string().min(1),
  source: z.string().min(1), // e.g. "USDA NRCS", "Kaggle", "Mendeley Data"
  url: z.string().url().nullable(),
  doi: z.string().nullable(),
  license: z.string().min(1),
  country: z.string().nullable(),
  region: z.string().nullable(),
  crop: z.string().nullable(),
  soilType: z.string().nullable(),
  sensorType: z.string().nullable(),
  samplingFrequency: z.string().nullable(), // human-readable, e.g. "hourly", "15-minute"
  timeRange: z
    .object({
      from: z.coerce.date().nullable(),
      to: z.coerce.date().nullable(),
    })
    .nullable(),
  originalUnits: z.record(z.string(), z.string()), // { columnName: unit }
  originalColumnNames: z.array(z.string()),
  targetVariables: z.array(z.string()),
  missingVariables: z.array(z.string()), // canonical fields this dataset cannot populate
  preprocessingPerformed: z.array(z.string()),
  // The honesty flag. false = this record came from a structural test
  // fixture, not a downloaded real file. See ai/external/README.md.
  ingested: z.boolean(),
  fixtureNote: z.string().nullable().optional(),
  loadedAt: z.coerce.date(),
});

module.exports = { ProvenanceSchema };
