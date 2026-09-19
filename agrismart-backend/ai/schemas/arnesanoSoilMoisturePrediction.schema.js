'use strict';

const { z } = require('zod');

const ArnesanoSoilMoisturePredictionSchema = z.object({
  target: z.literal('arnesano_soil_moisture_24h_forecast'),
  available: z.boolean(),
  fallback: z.boolean(),
  synthetic: z.boolean(),
  predictedSoilMoisturePercent: z.number().nullable(),
  confidence: z.enum(['none', 'low', 'medium', 'high']),
  explanation: z.array(z.string()),
  modelVersion: z.string().nullable(),
  modelType: z.string().nullable(),
  modelStatus: z.string().nullable(),
  generatedAt: z.coerce.date(),
  reason: z.string().nullable(),
  outOfDistribution: z.boolean().optional(),
});

module.exports = { ArnesanoSoilMoisturePredictionSchema };
