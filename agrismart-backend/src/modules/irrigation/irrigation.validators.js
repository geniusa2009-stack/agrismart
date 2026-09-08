'use strict';

const { z } = require('zod');

const objectIdRegex = /^[a-f0-9]{24}$/i;

const createValveSchema = z
  .object({
    deviceId: z.string().min(1),
    name: z.string().max(120).optional(),
  })
  .strict();

const valveIdParamsSchema = z
  .object({
    valveId: z.string().regex(objectIdRegex, 'Invalid valve id.'),
  })
  .strict();

const openValveSchema = z
  .object({
    requestedDurationSeconds: z.number().int().positive().max(24 * 60 * 60),
    idempotencyKey: z.string().min(1).max(100).optional(),
  })
  .strict();

const closeValveSchema = z
  .object({
    idempotencyKey: z.string().min(1).max(100).optional(),
  })
  .strict();

const farmIdParamsSchema = z
  .object({
    farmId: z.string().regex(objectIdRegex, 'Invalid farm id.'),
  })
  .strict();

const automationSettingsSchema = z
  .object({
    automationEnabled: z.boolean().optional(),
    autoOpenBelowPercent: z.number().min(0).max(100).optional(),
    autoCloseAbovePercent: z.number().min(0).max(100).optional(),
    autoDurationSeconds: z.number().int().positive().max(24 * 60 * 60).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' })
  .refine(
    (data) =>
      data.autoOpenBelowPercent === undefined ||
      data.autoCloseAbovePercent === undefined ||
      data.autoOpenBelowPercent < data.autoCloseAbovePercent,
    { message: 'autoOpenBelowPercent must be less than autoCloseAbovePercent.' }
  );

module.exports = {
  createValveSchema,
  valveIdParamsSchema,
  openValveSchema,
  closeValveSchema,
  farmIdParamsSchema,
  automationSettingsSchema,
};
