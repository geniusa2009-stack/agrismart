'use strict';

/**
 * ai/external/schemas/canonicalRecord.schema.js
 *
 * The common research schema every adapter normalizes into. Fields a
 * given dataset cannot populate stay `null` — NEVER fabricated to make
 * a dataset look more complete than it is (spec: "never fabricate
 * missing values merely to make datasets look complete").
 *
 * `dataSource` is the field that must never be blurred: it says
 * whether this record is external benchmark data, AgriSmart's own real
 * field telemetry, or AgriSmart's synthetic development data. Nothing
 * downstream is allowed to treat these interchangeably.
 */

const { z } = require('zod');

const CanonicalRecordSchema = z.object({
  timestamp: z.coerce.date(),
  farmId: z.string().nullable(),
  fieldId: z.string().nullable(),
  zoneId: z.string().nullable(),
  crop: z.string().nullable(),
  soilType: z.string().nullable(),

  soilMoisture: z.number().nullable(), // normalized to volumetric % (0-100) where the source allows; see normalization/units.js
  soilTemperature: z.number().nullable(), // °C
  soilEc: z.number().nullable(), // dS/m
  soilSalinity: z.number().nullable(), // ppt
  airTemperature: z.number().nullable(), // °C
  relativeHumidity: z.number().nullable(), // %
  precipitation: z.number().nullable(), // mm
  solarRadiation: z.number().nullable(), // W/m^2
  windSpeed: z.number().nullable(), // m/s

  irrigationState: z.enum(['open', 'closed', 'unknown']).nullable(),
  irrigationDurationSeconds: z.number().nullable(),
  waterVolumeLiters: z.number().nullable(),

  // Added for the Mendeley "Dataset on irrigation for Tomato" (DOI
  // 10.17632/33cngpcrmx.2) — a real dataset reporting NPK soil
  // nutrient values via an RS485 sensor, per its own description.
  // Optional (not just nullable) so every existing adapter/record that
  // predates this field keeps validating without change.
  soilNitrogen: z.number().nullable().optional(), // mg/kg
  soilPhosphorus: z.number().nullable().optional(), // mg/kg
  soilPotassium: z.number().nullable().optional(), // mg/kg
  atmosphericPressure: z.number().nullable().optional(), // hPa (BME280-style sensors report this)

  // Added for the "Soil Moisture, Irrigation Actuator and Weather
  // Dataset" (Arnesano, Italy, 2025 field trial) — a real dataset
  // reporting soil pH via a dedicated probe per sector. Optional (not
  // just nullable) for the same backward-compatibility reason as the
  // NPK fields above.
  soilPh: z.number().nullable().optional(),

  source: z.enum(['external', 'agrismart_real', 'synthetic_dev']),
  datasetId: z.string().min(1),
});

module.exports = { CanonicalRecordSchema };
