'use strict';

const { z } = require('zod');

// Strict, bounded ranges — "never trust sensor data" (Stage 2 section
// 11). Out-of-range/malformed readings are rejected at the edge, never
// silently clamped.
// AgriSmart-native data collection contract additions (see
// ai/external/AGRISMART_DATA_COLLECTION_CONTRACT.md and
// telemetry.model.js's header comment). `farmId`/`zoneId` are
// deliberately NOT accepted here — the top-level schema stays
// `.strict()` with no such keys, so a device attempting to claim its
// own farm/zone in the payload is rejected outright; those are always
// server-derived from the authenticated device (telemetry.service.js).
const flowMeterReadingSchema = z
  .object({
    cumulativeVolumeLiters: z.number().min(0).optional(),
    flowRateLitersPerMinute: z.number().min(0).optional(),
  })
  .strict()
  .refine((r) => Object.keys(r).length > 0, 'At least one flowMeter reading is required when flowMeter is present.');

const telemetryIngestSchema = z
  .object({
    messageId: z.string().min(1).max(100),
    sequenceNumber: z.number().int().nonnegative().optional(),
    deviceReportedAt: z.string().datetime().optional(),
    readings: z
      .object({
        soilMoisturePercent: z.number().min(0).max(100).optional(),
        soilSalinityPpt: z.number().min(0).max(50).optional(),
        temperatureCelsius: z.number().min(-40).max(85).optional(),
        soilEcMicrosiemensPerCm: z.number().min(0).optional(),
        airTemperatureCelsius: z.number().min(-40).max(60).optional(),
        relativeHumidityPercent: z.number().min(0).max(100).optional(),
        precipitationMm: z.number().min(0).optional(),
        flowMeter: flowMeterReadingSchema.optional(),
      })
      .strict()
      .refine((r) => Object.keys(r).length > 0, 'At least one reading is required.'),
  })
  .strict();

module.exports = { telemetryIngestSchema };
