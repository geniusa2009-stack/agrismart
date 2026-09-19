'use strict';

/**
 * ai/schemas/featureVector.schema.js
 *
 * Validates a single feature vector before it is used for training or
 * inference. Numeric features may be `null` (missing/unavailable —
 * e.g. no reading 6h ago yet) — the model training/inference code is
 * responsible for imputation, this schema only guarantees shape and
 * type, it never invents a value.
 */

const { z } = require('zod');
const { FEATURE_NAMES } = require('../features/featureVersion');

const nullableNumber = z.number().finite().nullable();

const featureShape = Object.fromEntries(FEATURE_NAMES.map((name) => [name, nullableNumber]));

const FeatureVectorSchema = z.object({
  deviceId: z.string().min(1),
  valveId: z.string().min(1).optional(),
  farmId: z.string().min(1).optional(),
  asOf: z.coerce.date(),
  featureVersion: z.string().min(1),
  features: z.object(featureShape),
});

module.exports = { FeatureVectorSchema };
