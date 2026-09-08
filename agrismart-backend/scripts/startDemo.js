'use strict';

/**
 * scripts/startDemo.js
 *
 * Entry point for `npm run demo`. This is the ONLY place a real
 * MongoDB connection string is optional — it boots an ephemeral,
 * throwaway in-memory MongoDB (mongodb-memory-server, the same package
 * already used by the Jest test suite) so the demo runs with zero
 * external dependencies (no Atlas cluster, no local mongod, no MQTT
 * broker). Refuses outright if NODE_ENV=production.
 *
 * Deliberately kept OUT of server.js / app.js: production/normal dev
 * startup (`npm start` / `npm run dev`) is completely unaffected by
 * this file existing — they still require a real MONGODB_URI in .env,
 * exactly as before.
 */

require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.error('[DEMO] Refusing to start demo mode with NODE_ENV=production.');
  process.exit(1);
}

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Demo-only fallback secrets — ONLY applied if the environment doesn't
// already define real ones (a .env with real secrets always wins).
// Clearly non-production-looking values, on purpose.
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'demo-mode-access-secret-not-for-production-use';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'demo-mode-refresh-secret-not-for-production-use';
process.env.CORS_ALLOWED_ORIGINS =
  process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'info';

async function main() {
  // eslint-disable-next-line no-console
  console.log('[DEMO] Starting AgriSmart demo mode (simulated device, ephemeral in-memory database)...');

  if (!process.env.MONGODB_URI) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri('agrismart_demo');
    // eslint-disable-next-line no-console
    console.log('[DEMO] Ephemeral in-memory MongoDB ready (no external database required).');

    process.on('exit', () => {
      mongod.stop().catch(() => {});
    });
  }

  // Required only now, AFTER env vars above are set — config/env.js
  // reads process.env at require-time.
  const { startServer } = require('../src/server');
  await startServer();

  const { runDemoSimulation } = require('./demoSimulator');
  await runDemoSimulation();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[DEMO] Fatal error starting demo mode:', err);
  process.exit(1);
});
