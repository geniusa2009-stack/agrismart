'use strict';

const { z } = require('zod');

// Strict, bounded ranges — "never trust sensor data" (Stage 2 section
// 11). Out-of-range/malformed readings are rejected at the edge, never
// silently clamped.
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
      })
      .strict()
      .refine((r) => Object.keys(r).length > 0, 'At least one reading is required.'),
  })
  .strict();

module.exports = { telemetryIngestSchema };
