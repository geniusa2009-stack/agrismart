'use strict';

const { z } = require('zod');

const createFarmSchema = z
  .object({
    name: z.string().min(1).max(120),
    location: z
      .object({
        governorate: z.string().max(60).optional(),
        village: z.string().max(60).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const updateFarmSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    location: z
      .object({
        governorate: z.string().max(60).optional(),
        village: z.string().max(60).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' });

const farmIdParamsSchema = z
  .object({
    farmId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid farm id.'),
  })
  .strict();

module.exports = { createFarmSchema, updateFarmSchema, farmIdParamsSchema };
