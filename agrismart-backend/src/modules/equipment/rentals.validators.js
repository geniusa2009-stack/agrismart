'use strict';

const { z } = require('zod');
const { paginationQueryFields } = require('../../utils/pagination');
const { objectIdSchema } = require('../../utils/objectId');

const createRentalRequestSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    message: z.string().trim().max(1000).optional(),
  })
  .strict();

const updateStatusSchema = z
  .object({
    action: z.enum(['accept', 'reject', 'cancel', 'complete']),
    responseNote: z.string().trim().max(500).optional(),
  })
  .strict();

const reviewRentalSchema = z
  .object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() })
  .strict();

const equipmentIdParamsSchema = z.object({ equipmentId: objectIdSchema('equipment id') }).strict();
const rentalIdParamsSchema = z.object({ rentalId: objectIdSchema('rental id') }).strict();

const listMineQuerySchema = z
  .object({
    as: z.enum(['owner', 'requester']).optional(),
    status: z.enum(['requested', 'accepted', 'rejected', 'cancelled', 'completed']).optional(),
    ...paginationQueryFields,
  })
  .strict();

module.exports = {
  createRentalRequestSchema,
  updateStatusSchema,
  reviewRentalSchema,
  equipmentIdParamsSchema,
  rentalIdParamsSchema,
  listMineQuerySchema,
};
