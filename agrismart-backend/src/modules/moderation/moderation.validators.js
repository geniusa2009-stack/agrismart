'use strict';

const { z } = require('zod');
const { paginationQueryFields } = require('../../utils/pagination');
const { objectIdSchema } = require('../../utils/objectId');
const { REPORT_TARGET_TYPES, REPORT_REASONS } = require('./report.model');

const fileReportSchema = z
  .object({
    targetType: z.enum(REPORT_TARGET_TYPES),
    targetId: objectIdSchema('target id'),
    reason: z.enum(REPORT_REASONS),
    description: z.string().trim().max(1000).optional(),
  })
  .strict();

const listQueueQuerySchema = z
  .object({
    status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']).optional(),
    ...paginationQueryFields,
  })
  .strict();

const resolveReportSchema = z
  .object({
    status: z.enum(['reviewing', 'resolved', 'dismissed']),
    resolutionNote: z.string().trim().max(1000).optional(),
  })
  .strict();

const reportIdParamsSchema = z.object({ reportId: objectIdSchema('report id') }).strict();

module.exports = { fileReportSchema, listQueueQuerySchema, resolveReportSchema, reportIdParamsSchema };
