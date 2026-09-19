'use strict';

const { z } = require('zod');
const { paginationQueryFields } = require('../../utils/pagination');
const { objectIdSchema } = require('../../utils/objectId');
const { SERVICE_TYPES, PRICING_UNITS } = require('./agriculturalService.model');

const pricingSchema = z.object({ unit: z.enum(PRICING_UNITS), amount: z.number().positive().max(10_000_000) }).strict();
const locationSchema = z
  .object({ governorate: z.string().trim().max(60).optional(), city: z.string().trim().max(60).optional() })
  .strict();

const createServiceSchema = z
  .object({
    serviceType: z.enum(SERVICE_TYPES),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(3000).optional(),
    location: locationSchema.optional(),
    serviceRadiusKm: z.number().min(0).max(500).optional(),
    pricing: pricingSchema,
  })
  .strict();

const updateServiceSchema = z
  .object({
    serviceType: z.enum(SERVICE_TYPES).optional(),
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(3000).optional(),
    location: locationSchema.optional(),
    serviceRadiusKm: z.number().min(0).max(500).optional(),
    pricing: pricingSchema.optional(),
    status: z.enum(['active', 'paused']).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' });

const moderateServiceSchema = z.object({ status: z.enum(['visible', 'hidden', 'removed']) }).strict();
const serviceIdParamsSchema = z.object({ serviceId: objectIdSchema('service id') }).strict();

const discoverQuerySchema = z
  .object({
    serviceType: z.enum(SERVICE_TYPES).optional(),
    governorate: z.string().trim().max(60).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    ...paginationQueryFields,
  })
  .strict();

module.exports = {
  createServiceSchema,
  updateServiceSchema,
  moderateServiceSchema,
  serviceIdParamsSchema,
  discoverQuerySchema,
};
