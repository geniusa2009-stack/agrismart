'use strict';

/**
 * infrastructure/database/mongoose.js
 *
 * Corrected MongoDB connection lifecycle (Stage 1 finding A1 fix).
 *
 * Prior version ran a custom exponential-backoff loop that manually
 * called mongoose.connect() again on every `disconnected` event. That
 * competed with the MongoDB Node driver's OWN background topology
 * monitor, which is already started internally the moment connect() is
 * first called and keeps retrying/recovering on its own — see
 * ARCHITECTURE_PLAN_STAGE2.md section 5A for the full reasoning.
 *
 * Corrected lifecycle:
 *   - connect() is called exactly once, at boot.
 *   - Connection-loss/recovery is handled entirely by the driver; this
 *     module only LISTENS to lifecycle events for logging + readiness.
 *   - getConnectionHealth() reads mongoose.connection.readyState
 *     directly — that IS the state machine, no custom one needed.
 *   - disconnect() closes the connection once, cleanly, on shutdown.
 */

const mongoose = require('mongoose');
const config = require('../../config');
const logger = require('../../observability/logger');

let listenersRegistered = false;

function buildConnectionOptions() {
  return {
    maxPoolSize: config.db.maxPoolSize,
    minPoolSize: config.db.minPoolSize,
    connectTimeoutMS: config.db.connectTimeoutMs,
    socketTimeoutMS: config.db.socketTimeoutMs,
    serverSelectionTimeoutMS: config.db.serverSelectionTimeoutMs,
    heartbeatFrequencyMS: config.db.heartbeatFrequencyMs,
    retryWrites: true,
    retryReads: true,
    bufferCommands: true,
    autoIndex: !config.isProduction,
    appName: 'agrismart-backend',
  };
}

function registerConnectionListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  const connection = mongoose.connection;

  connection.on('connected', () => {
    logger.info(
      { scope: 'mongodb', host: connection.host, name: connection.name },
      'MongoDB connection established.'
    );
  });

  connection.on('disconnected', () => {
    logger.warn({ scope: 'mongodb' }, 'MongoDB connection lost. Driver will recover automatically.');
  });

  connection.on('reconnected', () => {
    logger.info({ scope: 'mongodb' }, 'MongoDB connection restored.');
  });

  connection.on('error', (err) => {
    logger.error({ scope: 'mongodb', err }, 'MongoDB connection error.');
  });

  connection.on('close', () => {
    logger.info({ scope: 'mongodb' }, 'MongoDB connection closed.');
  });
}

/**
 * Establishes the MongoDB connection. Called exactly once at boot.
 * Idempotent: returns immediately if already connected/connecting.
 */
async function connectDB() {
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    return mongoose;
  }

  registerConnectionListeners();

  try {
    await mongoose.connect(config.db.uri, buildConnectionOptions());
    return mongoose;
  } catch (err) {
    logger.error({ scope: 'mongodb', err }, 'Initial MongoDB connection attempt failed.');
    // No manual retry here — the driver's topology monitor keeps trying
    // in the background. See module doc comment / Stage 2 section 5A.
    throw err;
  }
}

/**
 * Gracefully closes the MongoDB connection. Used during SIGTERM/SIGINT
 * shutdown and by the test harness's teardown.
 */
async function disconnectDB() {
  if (mongoose.connection.readyState === 0) {
    return;
  }
  await mongoose.connection.close(false);
  logger.info({ scope: 'mongodb' }, 'MongoDB connection closed gracefully.');
}

/**
 * Lightweight health snapshot for /health/ready. readyState IS the
 * state machine — no separate custom tracking needed.
 */
function getConnectionHealth() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting', 'uninitialized'];
  const readyState = mongoose.connection.readyState;
  return { state: states[readyState] || 'unknown', readyState };
}

module.exports = { connectDB, disconnectDB, getConnectionHealth, mongoose };
