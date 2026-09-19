'use strict';

/**
 * ai/schemas/irrigationEventPrediction.schema.js
 *
 * Response shape for the 'irrigation_event_next_1h' model — a sibling
 * to ai/schemas/prediction.schema.js (irrigation_need_next_3h), kept
 * as its OWN schema (not a shared/generic one) so the two targets can
 * never be silently substituted for each other by a caller passing the
 * wrong literal.
 */

const { z } = require('zod');

const IrrigationEventPredictionSchema = z.object({
  target: z.literal('irrigation_event_next_1h'),
  available: z.boolean(),
  fallback: z.boolean(),
  synthetic: z.boolean(),
  probability: z.number().min(0).max(1).nullable(),
  confidence: z.enum(['none', 'low', 'medium', 'high']),
  explanation: z.array(z.string()),
  modelVersion: z.string().nullable(),
  modelType: z.string().nullable(),
  modelStatus: z.enum(['candidate', 'validated', 'active', 'retired']).nullable(),
  generatedAt: z.coerce.date(),
  reason: z.string().nullable().optional(),
  outOfDistribution: z.boolean().optional(),
});

module.exports = { IrrigationEventPredictionSchema };
