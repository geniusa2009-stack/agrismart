'use strict';

/**
 * ai/schemas/regressionPrediction.schema.js
 *
 * Response shape for continuous-target (regression) advisory
 * predictions — a sibling to ai/schemas/prediction.schema.js, which
 * is shaped for the binary irrigation_need_next_3h classifier
 * (probability/recommendation enum). A regression estimate has
 * neither, so it gets its own schema rather than stretching the
 * classification one to (badly) fit.
 */

const { z } = require('zod');

const RegressionPredictionSchema = z.object({
  target: z.literal('tomato_soil_moisture_estimate'),
  available: z.boolean(),
  fallback: z.boolean(),
  synthetic: z.boolean(),
  estimatedValue: z.number().nullable(), // raw soil-moisture sensor units — see ai/external/README or AI_TRAINING_REPORT.md for the unit caveat
  unit: z.string().nullable(),
  confidence: z.enum(['none', 'low', 'medium', 'high']),
  explanation: z.array(z.string()),
  modelVersion: z.string().nullable(),
  modelType: z.string().nullable(),
  modelStatus: z.enum(['candidate', 'validated', 'active', 'retired']).nullable(),
  generatedAt: z.coerce.date(),
  reason: z.string().nullable().optional(),
  outOfDistribution: z.boolean().optional(),
});

module.exports = { RegressionPredictionSchema };
