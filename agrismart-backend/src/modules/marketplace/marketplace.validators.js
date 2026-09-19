'use strict';

const { z } = require('zod');
const { paginationQueryFields } = require('../../utils/pagination');
const { objectIdSchema } = require('../../utils/objectId');
const { LISTING_CATEGORIES } = require('./marketplaceListing.model');
const { SAVED_ITEM_TARGET_TYPES } = require('./savedItem.model');

const photoSchema = z
  .object({ url: z.string().trim().url().max(1000), caption: z.string().trim().max(200).optional() })
  .strict();
const locationSchema = z
  .object({ governorate: z.string().trim().max(60).optional(), city: z.string().trim().max(60).optional() })
  .strict();

const createListingSchema = z
  .object({
    category: z.enum(LISTING_CATEGORIES),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(3000).optional(),
    price: z.number().min(0).max(100_000_000),
    unit: z.string().trim().min(1).max(30),
    location: locationSchema.optional(),
    availability: z.enum(['in_stock', 'out_of_stock']).optional(),
    photos: z.array(photoSchema).max(10).optional(),
  })
  .strict();

const updateListingSchema = z
  .object({
    category: z.enum(LISTING_CATEGORIES).optional(),
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(3000).optional(),
    price: z.number().min(0).max(100_000_000).optional(),
    unit: z.string().trim().min(1).max(30).optional(),
    location: locationSchema.optional(),
    availability: z.enum(['in_stock', 'out_of_stock']).optional(),
    photos: z.array(photoSchema).max(10).optional(),
    status: z.enum(['active', 'paused']).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' });

const moderateListingSchema = z.object({ status: z.enum(['visible', 'hidden', 'removed']) }).strict();
const contactSellerSchema = z.object({ message: z.string().trim().min(1).max(500) }).strict();

const listingIdParamsSchema = z.object({ listingId: objectIdSchema('listing id') }).strict();

const discoverQuerySchema = z
  .object({
    category: z.enum(LISTING_CATEGORIES).optional(),
    governorate: z.string().trim().max(60).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    availability: z.enum(['in_stock', 'out_of_stock']).optional(),
    ...paginationQueryFields,
  })
  .strict();

const savedQuerySchema = z
  .object({ targetType: z.enum(SAVED_ITEM_TARGET_TYPES).optional(), ...paginationQueryFields })
  .strict();

const mineQuerySchema = z.object({ ...paginationQueryFields }).strict();

module.exports = {
  createListingSchema,
  updateListingSchema,
  moderateListingSchema,
  contactSellerSchema,
  listingIdParamsSchema,
  discoverQuerySchema,
  savedQuerySchema,
  mineQuerySchema,
};
