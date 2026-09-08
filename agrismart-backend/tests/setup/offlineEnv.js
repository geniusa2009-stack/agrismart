'use strict';

/**
 * tests/setup/offlineEnv.js
 *
 * Used ONLY by jest.offline.config.js — a diagnostic test run that
 * deliberately does NOT boot mongodb-memory-server (network-restricted
 * environments can't download its binary; see
 * tests/setup/globalSetup.js for the real, full test run). Sets every
 * env var config/env.js requires so the app can still be constructed
 * and pure-logic/route-graph tests can run for real, while any test
 * that actually needs a working database fails honestly and fast
 * (MONGO_SERVER_SELECTION_TIMEOUT_MS is kept short) rather than hanging.
 *
 * This file must never be used by `npm test` — only by
 * `npm run test:offline`, whose whole purpose is figuring out exactly
 * which tests pass without a real database and which don't.
 */

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/agrismart_offline_diagnostic';
process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS = '800';
process.env.MONGO_CONNECT_TIMEOUT_MS = '800';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod-0001';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod-0002';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.LOG_LEVEL = 'silent';
process.env.IRRIGATION_MAX_DURATION_SECONDS = '1800';
process.env.IRRIGATION_DAILY_ALLOWANCE_SECONDS = '3600';
process.env.DEVICE_OFFLINE_THRESHOLD_SECONDS = '300';
process.env.COMMAND_EXPIRY_SECONDS = '120';
