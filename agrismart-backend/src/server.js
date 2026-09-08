'use strict';

/**
 * server.js
 *
 * AgriSmart backend entry point. Cluster mode REMOVED (Stage 1 finding
 * B1 / Stage 2 section 5C decision) — scales horizontally via multiple
 * stateless container instances behind a load balancer instead of
 * in-process worker forking. See ARCHITECTURE_PLAN_STAGE2.md section
 * 5C for the full reasoning (connection-pool multiplication, memory
 * overhead, orchestrator redundancy).
 */

require('dotenv').config();

const http = require('http');
const config = require('./config');
const createApp = require('./app');
const { connectDB, disconnectDB } = require('./infrastructure/database/mongoose');
const commandsService = require('./modules/commands/commands.service');
const logger = require('./observability/logger');

const COMMAND_SWEEP_INTERVAL_MS = 30 * 1000;

let commandSweepTimer = null;

async function startServer() {
  try {
    await connectDB();
  } catch (err) {
    logger.error({ err }, 'Failed initial MongoDB connection attempt; continuing startup.');
    if (config.db.startupFailFast) {
      throw err;
    }
    // Non-fatal in dev/production (Stage 2 section 5A): the driver's
    // own topology monitor keeps retrying in the background; /health/
    // ready reports 503 until it succeeds.
  }

  const app = createApp();
  const server = http.createServer(app);

  server.keepAliveTimeout = config.server.keepAliveTimeoutMs;
  server.headersTimeout = config.server.headersTimeoutMs;
  server.requestTimeout = config.server.requestTimeoutMs;

  await new Promise((resolve, reject) => {
    server.once('error', (err) => {
      logger.error({ err }, 'HTTP server failed to start.');
      reject(err);
    });
    server.listen(config.server.port, config.server.host, () => {
      logger.info(
        { port: config.server.port, host: config.server.host, env: config.env, pid: process.pid },
        'AgriSmart backend listening.'
      );
      resolve();
    });
  });

  // Command-timeout sweep (Stage 2 section 9/21): safe as an in-process
  // interval on exactly ONE instance. Documented risk: the moment there
  // are 2+ instances this MUST move behind a single-owner mechanism —
  // see commands.service.js's sweepExpiredCommands() doc comment.
  commandSweepTimer = setInterval(() => {
    commandsService.sweepExpiredCommands().catch((err) => {
      logger.error({ err }, 'Command timeout sweep failed.');
    });
  }, COMMAND_SWEEP_INTERVAL_MS);
  commandSweepTimer.unref();

  registerProcessErrorCatchers();
  registerGracefulShutdown(server);

  return server;
}

function registerProcessErrorCatchers() {
  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error({ err: error }, 'Unhandled promise rejection.');
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception — initiating emergency shutdown.');
    disconnectDB()
      .catch(() => {})
      .finally(() => process.exit(1));
  });
}

function registerGracefulShutdown(server) {
  let isShuttingDown = false;

  function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, 'Beginning graceful shutdown.');

    if (commandSweepTimer) clearInterval(commandSweepTimer);

    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit.');
      process.exit(1);
    }, config.server.shutdownTimeoutMs);
    forceExitTimer.unref();

    server.close(async (err) => {
      if (err) {
        logger.error({ err }, 'Error while closing HTTP server.');
      } else {
        logger.info('HTTP server closed; no longer accepting new connections.');
      }

      try {
        await disconnectDB();
      } catch (dbErr) {
        logger.error({ err: dbErr }, 'Error while closing MongoDB connection during shutdown.');
      } finally {
        clearTimeout(forceExitTimer);
        logger.info('Graceful shutdown complete. Exiting.');
        process.exit(err ? 1 : 0);
      }
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  startServer().catch((err) => {
    logger.error({ err }, 'Fatal error during server startup.');
    process.exit(1);
  });
}

module.exports = { startServer };
