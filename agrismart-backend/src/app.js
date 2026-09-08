'use strict';

/**
 * app.js
 *
 * Builds and configures the Express application object. Kept separate
 * from server.js (process/socket lifecycle) so the app is fully
 * unit/API-testable via supertest without booting a real network
 * listener.
 *
 * Stage 1 fixes applied here:
 *   - A2/§5B: CORS rejection no longer throws into errorHandler as a
 *     500 — it's a browser-side policy decision (callback(null, false)),
 *     logged at `warn` via a metrics counter, never as an app error.
 *   - C2: Morgan replaced by pino-http (observability/httpLogger.js),
 *     which already skips BOTH /health/live and /health/ready.
 *   - C3/C4: Helmet's CSP (inert for a pure JSON API) is dropped;
 *     HSTS preload defaults to false (a deliberate go-live decision,
 *     not a default baked in early).
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');

const config = require('./config');
const requestId = require('./middleware/requestId');
const httpLogger = require('./observability/httpLogger');
const metrics = require('./observability/metrics');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(httpLogger);

  app.use(
    helmet({
      // No contentSecurityPolicy: this is a pure JSON API with no
      // browser-rendered views, so CSP directives would be inert (C3).
      // Helmet's other defaults (frameguard, noSniff, etc.) still apply.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: {
        maxAge: 63072000,
        includeSubDomains: true,
        // Deliberately false by default — HSTS preload-list submission
        // is a near-irreversible operational commitment that should be
        // a deliberate go-live decision, not a default (C4).
        preload: false,
      },
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header = non-browser client (mobile app, ESP32,
        // curl, server-to-server) — CORS doesn't apply to these at all;
        // it's a browser-only protection.
        if (!origin) return callback(null, true);

        if (config.cors.allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        // A2 fix: never throw here. `callback(null, false)` makes the
        // cors middleware simply omit the ACAO header — the browser
        // blocks the response client-side, and the server itself still
        // executes normally rather than surfacing a fake 500.
        metrics.increment('cors_rejections_total');
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id', 'X-Device-Key', 'X-Request-Id', 'X-Correlation-Id'],
      exposedHeaders: ['X-Request-Id', 'X-Correlation-Id'],
      maxAge: 600,
    })
  );

  app.use(compression({ threshold: 512, level: 6 }));

  app.use(express.json({ limit: config.bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));

  // NOTE: no blanket IP-keyed limiter is mounted globally on /api.
  // Every module route below applies the limiter matching its actual
  // identity (authLimiter for pre-auth attempts, deviceIngestLimiter
  // keyed by verified deviceId, commandLimiter keyed by (user, device))
  // — see middleware/rateLimiter.js's header comment. Mounting a
  // blanket IP-keyed `publicApiLimiter` here would silently reintroduce
  // the shared-NAT unfairness problem that identity-based keying was
  // specifically designed to avoid (Stage 2 section 5D): every device
  // ingest/command request would hit the IP bucket before ever reaching
  // its own correctly-scoped limiter. `publicApiLimiter` stays exported
  // for any genuinely public, unauthenticated route added later where
  // no better identity exists yet.

  app.get('/', (req, res) => {
    res.status(200).json({ success: true, service: 'agrismart-backend', message: 'AgriSmart API is running.' });
  });

  app.use(routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
