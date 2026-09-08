'use strict';

/**
 * Failure test: MongoDB unreachable (Stage 1 finding A1 fix
 * verification). connectDB() must reject cleanly with an error — it
 * must NOT hang indefinitely, and (per server.js's policy) a failed
 * initial connection must not be treated as fatal outside of
 * DB_STARTUP_FAIL_FAST=true.
 */

describe('MongoDB unavailable at startup', () => {
  test('connectDB() rejects (does not hang) when MongoDB is unreachable', async () => {
    // Tests run --runInBand (single shared process); process.env is the
    // real Node process object, so it must be restored afterward or
    // later test FILES in the same run would inherit a broken URI.
    const originalUri = process.env.MONGODB_URI;
    const originalSelectionTimeout = process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS;
    const originalConnectTimeout = process.env.MONGO_CONNECT_TIMEOUT_MS;

    jest.resetModules();
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unreachable';
    process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS = '1000';
    process.env.MONGO_CONNECT_TIMEOUT_MS = '1000';

    try {
      const { connectDB, mongoose } = require('../../src/infrastructure/database/mongoose');
      await expect(connectDB()).rejects.toThrow();
      await mongoose.disconnect().catch(() => {});
    } finally {
      process.env.MONGODB_URI = originalUri;
      process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS = originalSelectionTimeout;
      process.env.MONGO_CONNECT_TIMEOUT_MS = originalConnectTimeout;
      jest.resetModules();
    }
  }, 15000);
});
