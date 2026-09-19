'use strict';

/**
 * utils/objectId.js
 *
 * Shared zod fragment for validating a route param / body field as a
 * plausible Mongo ObjectId shape, matching the exact regex already used
 * ad hoc in farms.validators.js/commands.validators.js. Centralized
 * here so every new Community-layer module validates ids the same way
 * instead of re-deriving the regex per module.
 */

const { z } = require('zod');

function objectIdSchema(label = 'id') {
  return z.string().regex(/^[a-f0-9]{24}$/i, `Invalid ${label}.`);
}

module.exports = { objectIdSchema };
