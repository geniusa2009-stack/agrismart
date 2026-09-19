'use strict';

/**
 * ai/schemas/prediction.schema.js
 *
 * Every response returned by inference/predict.js and
 * services/aiInsightService.js must satisfy this shape — enforced by
 * tests (tests/ai/inference.test.js), not just documented.
 */

const { z } = require('zod');

const PredictionSchema = z.object({
  target: z.literal('irrigation_need_next_3h'),
  available: z.boolean(),
  fallback: z.boolean(),
  synthetic: z.boolean(),
  probability: z.number().min(0).max(1).nullable(),
  confidence: z.enum(['none', 'low', 'medium', 'high']),
  recommendation: z.enum(['recommend_irrigation', 'monitor', 'no_action', 'insufficient_data']),
  explanation: z.array(z.string()),
  modelVersion: z.string().nullable(),
  modelType: z.string().nullable(),
  generatedAt: z.coerce.date(),
  reason: z.string().nullable().optional(),
  outOfDistribution: z.boolean().optional(),
});

module.exports = { PredictionSchema };
