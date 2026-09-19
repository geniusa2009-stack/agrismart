'use strict';

const { z } = require('zod');
const { paginationQueryFields } = require('../../utils/pagination');
const { objectIdSchema } = require('../../utils/objectId');
const { EQUIPMENT_TYPES, PRICING_UNITS, CONDITIONS } = require('./equipment.model');

const photoSchema = z
  .object({ url: z.string().trim().url().max(1000), caption: z.string().trim().max(200).optional() })
  .strict();

const pricingSchema = z
  .object({ unit: z.enum(PRICING_UNITS), amount: z.number().positive().max(10_000_000) })
  .strict();

const locationSchema = z
  .object({
    governorate: z.string().trim().max(60).optional(),
    city: z.string().trim().max(60).optional(),
  })
  .strict();

const createEquipmentSchema = z
  .object({
    equipmentType: z.enum(EQUIPMENT_TYPES),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(3000).optional(),
    location: locationSchema.optional(),
    serviceRadiusKm: z.number().min(0).max(500).optional(),
    pricing: pricingSchema,
    condition: z.enum(CONDITIONS).optional(),
    operatorAvailable: z.boolean().optional(),
    photos: z.array(photoSchema).max(10).optional(),
  })
  .strict();

// Deliberately excludes ownerId/status/moderationStatus/ratingAverage/
// ratingCount — none of these are ever client-settable via a normal
// update (section 10/26).
const updateEquipmentSchema = z
  .object({
    equipmentType: z.enum(EQUIPMENT_TYPES).optional(),
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(3000).optional(),
    location: locationSchema.optional(),
    serviceRadiusKm: z.number().min(0).max(500).optional(),
    pricing: pricingSchema.optional(),
    condition: z.enum(CONDITIONS).optional(),
    operatorAvailable: z.boolean().optional(),
    photos: z.array(photoSchema).max(10).optional(),
    status: z.enum(['active', 'paused']).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' });

const moderateEquipmentSchema = z.object({ status: z.enum(['visible', 'hidden', 'removed']) }).strict();

const equipmentIdParamsSchema = z.object({ equipmentId: objectIdSchema('equipment id') }).strict();

const discoverQuerySchema = z
  .object({
    equipmentType: z.enum(EQUIPMENT_TYPES).optional(),
    governorate: z.string().trim().max(60).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    condition: z.enum(CONDITIONS).optional(),
    operatorAvailable: z.coerce.boolean().optional(),
    ...paginationQueryFields,
  })
  .strict();

module.exports = {
  createEquipmentSchema,
  updateEquipmentSchema,
  moderateEquipmentSchema,
  equipmentIdParamsSchema,
  discoverQuerySchema,
};
