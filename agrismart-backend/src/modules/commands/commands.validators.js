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
    // AgriSmart-native data collection contract (`water_volume` — see
    // ai/external/AGRISMART_DATA_COLLECTION_CONTRACT.md): only
    // meaningful on a CLOSE_VALVE command's result, and only when the
    // reporting device has a flow meter. Recorded as-is on the
    // matching IrrigationEvent — never derived/estimated backend-side
    // (see irrigationEvent.model.js's header comment).
    appliedWaterVolumeLiters: z.number().min(0).optional(),
  })
  .strict();

module.exports = { commandIdParamsSchema, executionResultSchema };
