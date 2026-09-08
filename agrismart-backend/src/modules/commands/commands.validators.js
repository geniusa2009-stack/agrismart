'use strict';

const { z } = require('zod');

const commandIdParamsSchema = z
  .object({
    commandId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid command id.'),
  })
  .strict();

const executionResultSchema = z
  .object({
    success: z.boolean(),
    details: z.record(z.unknown()).optional(),
    valveId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
    confirmedValveState: z.enum(['open', 'closed', 'unknown']).optional(),
  })
  .strict();

module.exports = { commandIdParamsSchema, executionResultSchema };
