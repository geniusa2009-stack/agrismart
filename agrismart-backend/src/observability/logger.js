'use strict';

/**
 * observability/logger.js
 *
 * Central structured logger (Stage 1 finding C1 fix — replaces the
 * hand-rolled console.log wrapper). Every call site imports THIS
 * module rather than configuring redaction/levels itself, so
 * sensitive-field redaction is defined exactly once and applies
 * everywhere (Stage 2 section 5G).
 */

const pino = require('pino');

// config/index.js is not imported here to avoid a require cycle risk
// during early bootstrap in tests that construct the logger before full
// config load; LOG_LEVEL/NODE_ENV are read directly and safely default.
const level = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const logger = pino({
  level,
  // Silence log output entirely during automated test runs so `npm
  // test` output stays readable; flip LOG_LEVEL back on for debugging a
  // specific failing test locally.
  enabled: !isTest,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-device-key"]',
      'req.headers.cookie',
      'password',
      'newPassword',
      'currentPassword',
      '*.password',
      'token',
      'accessToken',
      'refreshToken',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      'deviceSecret',
      '*.deviceSecret',
      'deviceKey',
      '*.deviceKey',
    ],
    censor: '[REDACTED]',
  },
  transport:
    !isProduction && !isTest
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});

module.exports = logger;
