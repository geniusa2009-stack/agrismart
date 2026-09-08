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
    let mongod;
    try {
      mongod = await MongoMemoryServer.create();
    } catch (err) {
      // The most common real-world failure here is not a bug in this
      // script — it's that this is the FIRST time mongodb-memory-server
      // has run on this machine and it needs to download a MongoDB
      // binary (~70MB) from fastdl.mongodb.org, and that download is
      // blocked or unreachable (offline, captive/conference wifi,
      // corporate firewall, demo venue with no internet). After a
      // successful first download it is cached locally and no further
      // network access is needed. Surface that clearly instead of a
      // raw stack trace, and point at the documented escape hatch.
      // eslint-disable-next-line no-console
      console.error(
        [
          '[DEMO] Could not start the built-in in-memory MongoDB.',
          '[DEMO] This almost always means this machine could not download the',
          '[DEMO] MongoDB binary (first run only; it is cached after that).',
          '[DEMO]',
          '[DEMO] To fix, either:',
          '[DEMO]   1) Connect this machine to the internet and re-run `npm run demo`',
          '[DEMO]      (only the first run needs network access), or',
          '[DEMO]   2) Point the demo at a real MongoDB instance instead by setting',
          '[DEMO]      MONGODB_URI in agrismart-backend/.env, e.g.:',
          '[DEMO]        MONGODB_URI=mongodb://127.0.0.1:27017/agrismart_demo',
          '[DEMO]      then re-run `npm run demo` (no other code changes needed).',
          '[DEMO]',
          '[DEMO] See agrismart-backend/DEMO.md for details.',
          '[DEMO] Underlying error:',
        ].join('\n')
      );
      throw err;
    }
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
