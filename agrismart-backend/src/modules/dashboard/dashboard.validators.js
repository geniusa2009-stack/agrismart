'use strict';

const { z } = require('zod');

const objectIdRegex = /^[a-f0-9]{24}$/i;

const farmIdParamsSchema = z
  .object({
    farmId: z.string().regex(objectIdRegex, 'Invalid farm id.'),
  })
  .strict();

const deviceIdParamsSchema = z
  .object({
    deviceId: z.string().min(1),
  })
  .strict();

const telemetryRangeQuerySchema = z
  .object({
    range: z.enum(['live', '24h', '7d', '30d']).default('24h'),
  })
  .strict();

const alertParamsSchema = z
  .object({
    farmId: z.string().regex(objectIdRegex, 'Invalid farm id.'),
    alertId: z.string().min(1).max(200),
  })
  .strict();

module.exports = {
  farmIdParamsSchema,
  deviceIdParamsSchema,
  telemetryRangeQuerySchema,
  alertParamsSchema,
};
