'use strict';

/**
 * middleware/validate.js
 *
 * Generic zod-schema-driven request validator (Stage 2 section 11).
 * Every route that accepts external input wraps it with
 * `validate(schema, 'body' | 'params' | 'query')`. Schemas use
 * `.strict()` so unknown fields are rejected outright (defense against
 * mass-assignment), and the parsed/coerced result REPLACES the raw
 * input so downstream code only ever sees normalized data.
 */

const { ApiError, ErrorCodes } = require('./errorHandler');

/**
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'params'|'query'} source
 */
function validate(schema, source = 'body') {
  return function validateMiddleware(req, res, next) {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return next(
        ApiError.badRequest('Request validation failed.', {
          code: ErrorCodes.VALIDATION_ERROR,
          details,
        })
      );
    }

    req[source] = result.data;
    next();
  };
}

module.exports = validate;
