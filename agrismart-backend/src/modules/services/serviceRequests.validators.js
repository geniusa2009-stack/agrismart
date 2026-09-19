'use strict';

const { z } = require('zod');
const { paginationQueryFields } = require('../../utils/pagination');
const { objectIdSchema } = require('../../utils/objectId');
const { SERVICE_REQUEST_STATUSES } = require('./serviceRequest.model');

const createServiceRequestSchema = z
  .object({
    preferredDate: z.coerce.date().optional(),
    message: z.string().trim().max(1000).optional(),
  })
  .strict();

const updateStatusSchema = z
  .object({
    action: z.enum(['accept', 'reject', 'start', 'complete', 'cancel']),
    responseNote: z.string().trim().max(500).optional(),
  })
  .strict();

const reviewRequestSchema = z
  .object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() })
  .strict();

const serviceIdParamsSchema = z.object({ serviceId: objectIdSchema('service id') }).strict();
const requestIdParamsSchema = z.object({ requestId: objectIdSchema('service request id') }).strict();

const listMineQuerySchema = z
  .object({
    as: z.enum(['provider', 'requester']).optional(),
    status: z.enum(SERVICE_REQUEST_STATUSES).optional(),
    ...paginationQueryFields,
  })
  .strict();

module.exports = {
  createServiceRequestSchema,
  updateStatusSchema,
  reviewRequestSchema,
  serviceIdParamsSchema,
  requestIdParamsSchema,
  listMineQuerySchema,
};
