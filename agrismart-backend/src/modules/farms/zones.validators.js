'use strict';

const { z } = require('zod');

const objectIdRegex = /^[a-f0-9]{24}$/i;

const createZoneSchema = z
  .object({
    name: z.string().min(1).max(120),
    cropType: z.string().max(120).optional(),
    growthStage: z.string().max(60).optional(),
    soilType: z.string().max(60).optional(),
    plantingDate: z.string().datetime().optional(),
  })
  .strict();

const updateZoneSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    cropType: z.string().max(120).optional(),
    growthStage: z.string().max(60).optional(),
    soilType: z.string().max(60).optional(),
    plantingDate: z.string().datetime().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' });

const farmIdParamsSchema = z
  .object({
    farmId: z.string().regex(objectIdRegex, 'Invalid farm id.'),
  })
  .strict();

const zoneIdParamsSchema = z
  .object({
    zoneId: z.string().regex(objectIdRegex, 'Invalid zone id.'),
  })
  .strict();

module.exports = { createZoneSchema, updateZoneSchema, farmIdParamsSchema, zoneIdParamsSchema };
