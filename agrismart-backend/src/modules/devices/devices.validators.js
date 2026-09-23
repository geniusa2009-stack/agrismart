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

// AgriSmart-native data collection contract: assigns (zoneId string) or
// clears (zoneId null) this device's zone. Cross-farm assignment is
// checked server-side in devices.service.assignZone(), not here.
const assignZoneSchema = z
  .object({
    zoneId: z.union([z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid zone id.'), z.null()]),
  })
  .strict();

module.exports = {
  provisionDeviceSchema,
  deviceIdParamsSchema,
  heartbeatSchema,
  updateDeviceSchema,
  assignZoneSchema,
};
