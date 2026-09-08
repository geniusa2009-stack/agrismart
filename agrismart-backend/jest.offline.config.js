'use strict';

/**
 * jest.offline.config.js
 *
 * DIAGNOSTIC-ONLY config: runs the real test files (no rewriting, no
 * mocking of application code) WITHOUT booting mongodb-memory-server,
 * so this can run in network-restricted environments. Skips
 * globalSetup/globalTeardown (no Mongo binary download) and
 * tests/setup/testDb.js (no connectDB()/collection cleanup, since
 * there is no real database).
 *
 * Tests that don't touch the database at all still run for real and
 * must genuinely pass. Tests that do touch the database will fail
 * honestly (fast — see offlineEnv.js's short timeouts) rather than
 * hang, which is exactly the signal this config exists to produce:
 * proof of which specific tests need a real MongoDB and which don't.
 *
 * NEVER used by `npm test` — see package.json's separate
 * "test:offline" script. The real suite (`npm test`) is unchanged and
 * remains the source of truth.
 */

module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup/offlineEnv.js'],
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 15000,
  clearMocks: true,
};
