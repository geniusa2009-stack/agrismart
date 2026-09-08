'use strict';

const { loadEnv } = require('../../src/config/env');

function validBaseEnv(overrides = {}) {
  return {
    MONGODB_URI: 'mongodb://localhost:27017/test',
    JWT_ACCESS_SECRET: 'a'.repeat(20),
    JWT_REFRESH_SECRET: 'b'.repeat(20),
    ...overrides,
  };
}

describe('config/env — fail-fast validation (Stage 1 finding B4 fix)', () => {
  test('accepts a minimal valid environment and applies defaults', () => {
    const env = loadEnv(validBaseEnv());
    expect(env.PORT).toBe(5000);
    expect(env.NODE_ENV).toBe('development');
  });

  test('throws with a clear message when MONGODB_URI is missing', () => {
    const fullEnv = validBaseEnv();
    delete fullEnv.MONGODB_URI;
    expect(() => loadEnv(fullEnv)).toThrow(/MONGODB_URI/);
  });

  test('throws when JWT_ACCESS_SECRET is too short', () => {
    expect(() => loadEnv(validBaseEnv({ JWT_ACCESS_SECRET: 'short' }))).toThrow(
      /JWT_ACCESS_SECRET/
    );
  });

  test('rejects an unrecognized NODE_ENV instead of silently accepting it', () => {
    expect(() => loadEnv(validBaseEnv({ NODE_ENV: 'productionn' }))).toThrow();
  });
});
