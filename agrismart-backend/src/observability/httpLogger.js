'use strict';

/**
 * observability/httpLogger.js
 *
 * Replaces morgan with pino-http (Stage 2 section 19 dependency swap):
 * one structured logger for both application and access logs, with
 * requestId/correlationId automatically bound to every access log line
 * via the same logger instance.
 */

const pinoHttp = require('pino-http');
const logger = require('./logger');

const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id,
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Skip both health endpoints — Stage 1 finding C2 fix (was only
  // skipping /health/live, leaving /health/ready to flood logs under
  // frequent orchestrator polling).
  autoLogging: {
    ignore: (req) => req.url.startsWith('/health'),
  },
  customProps: (req) => ({
    correlationId: req.correlationId,
  }),
});

module.exports = httpLogger;
