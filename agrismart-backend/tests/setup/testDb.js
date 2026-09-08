'use strict';

/**
 * tests/setup/testDb.js
 *
 * setupFilesAfterEnv: runs before each test file's own tests (but after
 * that file's top-level requires, since Jest evaluates
 * setupFilesAfterEnv modules first). Connects to the in-memory MongoDB
 * that globalSetup.js started, clears all collections between tests so
 * tests don't leak state into each other, and disconnects cleanly at
 * the end.
 */

const { connectDB, disconnectDB, mongoose } = require('../../src/infrastructure/database/mongoose');

beforeAll(async () => {
  await connectDB();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await disconnectDB();
});
