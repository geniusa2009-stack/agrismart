'use strict';

/**
 * config/env.js
 *
 * The ONLY file in this codebase allowed to read `process.env` directly.
 * Every required variable is validated eagerly, once, at module load time
 * (i.e. at process boot, before server.js binds a port or touches
 * MongoDB). Missing or malformed required configuration throws
 * immediately — this is the one deliberate fail-fast path in the
 * architecture (contrast with config/db.js's MongoDB-unreachable case,
 * which is intentionally NOT fail-fast; see ARCHITECTURE_PLAN_STAGE2.md
 * section 5A/5F for the reasoning).
 */

const { z } = require('zod');

// dotenv is loaded by the caller (server.js / test setup) before this
// module is required, so process.env is already populated here.

const boolFromString = (defaultValue) =>
  z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined) return defaultValue;
      return val.toLowerCase() === 'true';
    });

const numberFromString = (defaultValue) =>
  z
    .string()
    .optional()
    .transform((val) => (val === undefined || val === '' ? defaultValue : Number(val)))
    .pipe(z.number().finite());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: numberFromString(5000),
  HOST: z.string().default('0.0.0.0'),

  // MongoDB is required in every environment except test, where the Jest
  // global setup (tests/setup/testDb.js) injects a live in-memory Mongo
  // URI before this module is evaluated.
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required.'),
  MONGO_MAX_POOL_SIZE: numberFromString(20),
  MONGO_MIN_POOL_SIZE: numberFromString(2),
  MONGO_CONNECT_TIMEOUT_MS: numberFromString(30000),
  MONGO_SOCKET_TIMEOUT_MS: numberFromString(45000),
  MONGO_SERVER_SELECTION_TIMEOUT_MS: numberFromString(20000),
  MONGO_HEARTBEAT_FREQUENCY_MS: numberFromString(10000),
  // See ARCHITECTURE_PLAN_STAGE2.md section 5A: in CI/test, a failed
  // initial connection should fail the pipeline loudly instead of
  // retrying silently. Defaults to false (production/dev: stay up and
  // let the driver's own topology monitor recover).
  DB_STARTUP_FAIL_FAST: boolFromString(false),

  CORS_ALLOWED_ORIGINS: z.string().default(''),
  JSON_BODY_LIMIT: z.string().default('256kb'),

  RATE_LIMIT_API_WINDOW_MS: numberFromString(15 * 60 * 1000),
  RATE_LIMIT_API_MAX: numberFromString(300),
  RATE_LIMIT_AUTH_WINDOW_MS: numberFromString(15 * 60 * 1000),
  RATE_LIMIT_AUTH_MAX: numberFromString(20),
  RATE_LIMIT_DEVICE_WINDOW_MS: numberFromString(60 * 1000),
  RATE_LIMIT_DEVICE_MAX: numberFromString(120),
  RATE_LIMIT_COMMAND_WINDOW_MS: numberFromString(60 * 1000),
  RATE_LIMIT_COMMAND_MAX: numberFromString(10),

  // Community layer (Overnight Community task, section 11): identity-
  // scoped (by authenticated userId, never IP — same philosophy as the
  // IoT limiters above) limits for the actions most exposed to spam/
  // abuse. Defaults are deliberately generous enough not to block a
  // real farmer's normal usage while still bounding write volume.
  RATE_LIMIT_COMMUNITY_WRITE_WINDOW_MS: numberFromString(60 * 1000),
  RATE_LIMIT_COMMUNITY_WRITE_MAX: numberFromString(20),
  RATE_LIMIT_COMMUNITY_ENGAGEMENT_WINDOW_MS: numberFromString(60 * 1000),
  RATE_LIMIT_COMMUNITY_ENGAGEMENT_MAX: numberFromString(60),
  RATE_LIMIT_COMMUNITY_REPORT_WINDOW_MS: numberFromString(60 * 60 * 1000),
  RATE_LIMIT_COMMUNITY_REPORT_MAX: numberFromString(15),
  RATE_LIMIT_TRANSACTION_WINDOW_MS: numberFromString(60 * 1000),
  RATE_LIMIT_TRANSACTION_MAX: numberFromString(15),

  JWT_ACCESS_SECRET: z
    .string()
    .min(16, 'JWT_ACCESS_SECRET must be at least 16 characters.'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, 'JWT_REFRESH_SECRET must be at least 16 characters.'),
  JWT_ACCESS_TOKEN_TTL: z.string().default('15m'),
  JWT_REFRESH_TOKEN_TTL_DAYS: numberFromString(30),

  BCRYPT_SALT_ROUNDS: numberFromString(12),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  SHUTDOWN_TIMEOUT_MS: numberFromString(15000),
  SERVER_KEEP_ALIVE_TIMEOUT_MS: numberFromString(65000),
  SERVER_HEADERS_TIMEOUT_MS: numberFromString(66000),
  SERVER_REQUEST_TIMEOUT_MS: numberFromString(60000),

  IRRIGATION_MAX_DURATION_SECONDS: numberFromString(3600),
  IRRIGATION_DAILY_ALLOWANCE_SECONDS: numberFromString(7200),
  DEVICE_OFFLINE_THRESHOLD_SECONDS: numberFromString(300),
  COMMAND_EXPIRY_SECONDS: numberFromString(120),
});

/**
 * Parses and validates process.env. Throws a single, clearly-formatted
 * error listing every problem found (not just the first) if validation
 * fails, so a misconfigured deployment gets one useful error instead of
 * a whack-a-mole sequence of restarts.
 */
function loadEnv(source = process.env) {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid or missing environment configuration. Refusing to start.\n${issues}`
    );
  }

  return result.data;
}

module.exports = { loadEnv, envSchema };
