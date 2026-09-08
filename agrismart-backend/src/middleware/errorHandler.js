'use strict';

/**
 * middleware/errorHandler.js
 *
 * Centralized error architecture. Fixes Stage 1 finding B7 (stack
 * traces are now ALWAYS in the server-side log, regardless of
 * environment — only the HTTP response hides them in production) and
 * adds a machine-readable `code` to every error response so clients can
 * branch on `error.code` instead of parsing message text.
 */

const config = require('../config');
const logger = require('../observability/logger');

const ErrorCodes = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_REFRESH_REUSE_DETECTED: 'AUTH_REFRESH_REUSE_DETECTED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  DEVICE_UNAUTHORIZED: 'DEVICE_UNAUTHORIZED',
  DEVICE_SUSPENDED: 'DEVICE_SUSPENDED',
  CONFLICT_DUPLICATE: 'CONFLICT_DUPLICATE',
  IRRIGATION_SAFETY_VIOLATION: 'IRRIGATION_SAFETY_VIOLATION',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

/**
 * Typed operational error. Throw this (or use a static factory below)
 * anywhere in the request lifecycle.
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   * @param {{ code?: string, details?: unknown }} [opts]
   */
  constructor(statusCode, message, opts = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = opts.code || ErrorCodes.INTERNAL_ERROR;
    this.details = opts.details;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message, opts) {
    return new ApiError(400, message, { code: ErrorCodes.VALIDATION_ERROR, ...opts });
  }

  static unauthorized(message, opts) {
    return new ApiError(401, message, { code: ErrorCodes.AUTH_INVALID_CREDENTIALS, ...opts });
  }

  static forbidden(message, opts) {
    return new ApiError(403, message, { code: ErrorCodes.FORBIDDEN, ...opts });
  }

  static notFound(message, opts) {
    return new ApiError(404, message, { code: ErrorCodes.NOT_FOUND, ...opts });
  }

  static conflict(message, opts) {
    return new ApiError(409, message, { code: ErrorCodes.CONFLICT_DUPLICATE, ...opts });
  }
}

/**
 * 404 handler — registered after all routes, before errorHandler.
 */
function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Terminal Express error middleware. Must keep all 4 params.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const isOperational = Boolean(err.isOperational);
  const code = err.code || ErrorCodes.INTERNAL_ERROR;

  // The log ALWAYS gets the stack trace, regardless of NODE_ENV — this
  // is the Stage 1 B7 fix. Only the HTTP response (below) hides it from
  // clients in production.
  const logPayload = {
    statusCode,
    code,
    isOperational,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    requestId: req.id,
    correlationId: req.correlationId,
    err,
  };

  if (statusCode >= 500) {
    logger.error(logPayload, err.message);
  } else {
    logger.warn(logPayload, err.message);
  }

  if (res.headersSent) {
    return next(err);
  }

  const responseBody = {
    success: false,
    error: {
      code,
      message: isOperational || statusCode < 500 ? err.message : 'Internal server error.',
      statusCode,
      requestId: req.id,
    },
  };

  if (err.details) {
    responseBody.error.details = err.details;
  }

  if (!config.isProduction && !isOperational) {
    responseBody.error.stack = err.stack;
  }

  res.status(statusCode).json(responseBody);
}

/**
 * Wraps an async Express handler so a rejected promise reaches next().
 */
function asyncHandler(fn) {
  return function wrappedAsyncHandler(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  ApiError,
  ErrorCodes,
  notFoundHandler,
  errorHandler,
  asyncHandler,
};
