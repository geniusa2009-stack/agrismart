'use strict';

const { z } = require('zod');

const provisionDeviceSchema = z
  .object({
    farmId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid farm id.'),
    name: z.string().min(1).max(120).optional(),
  })
  .strict();

const deviceIdParamsSchema = z
  .object({
    deviceId: z.string().min(1),
  })
  .strict();

const heartbeatSchema = z
  .object({
    firmwareVersion: z.string().max(40).optional(),
    batteryPercent: z.number().min(0).max(100).optional(),
    signalStrengthDbm: z.number().min(-140).max(0).optional(),
  })
  .strict();

const updateDeviceSchema = z
  .object({
    name: z.string().min(1).max(120),
  })
  .strict();

module.exports = { provisionDeviceSchema, deviceIdParamsSchema, heartbeatSchema, updateDeviceSchema };
