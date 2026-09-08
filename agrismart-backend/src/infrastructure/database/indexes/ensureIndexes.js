'use strict';

/**
 * infrastructure/database/indexes/ensureIndexes.js
 *
 * Explicit index-management script (Stage 1 finding B3/B4/E fix).
 * Indexes are declared once, on each schema, in the model files
 * themselves — this script has no index definitions of its own, it
 * just triggers `syncIndexes()` for every model. Run as a CI/CD deploy
 * step (or manually before first launch), NOT on every process boot in
 * a multi-instance fleet (concurrent syncIndexes() calls across
 * instances could race). Idempotent: running it twice creates no
 * duplicate indexes and errors on neither run.
 *
 * Time Series collections (Telemetry) are excluded — MongoDB manages
 * their timeField index internally and does not support the same
 * syncIndexes() semantics as a regular collection's secondary indexes
 * in every server version; verify manually against your Atlas tier if
 * additional telemetry indexes are needed later.
 */

require('dotenv').config();

const { connectDB, disconnectDB } = require('../mongoose');
const logger = require('../../../observability/logger');

const User = require('../../../modules/users/user.model');
const Farm = require('../../../modules/farms/farm.model');
const Device = require('../../../modules/devices/device.model');
const RefreshToken = require('../../../modules/auth/refreshToken.model');
const TelemetryIdempotencyKey = require('../../../modules/telemetry/telemetryIdempotency.model');
const DeviceCommand = require('../../../modules/commands/deviceCommand.model');
const Valve = require('../../../modules/irrigation/valve.model');
const IrrigationEvent = require('../../../modules/irrigation/irrigationEvent.model');

const MODELS = [User, Farm, Device, RefreshToken, TelemetryIdempotencyKey, DeviceCommand, Valve, IrrigationEvent];

async function ensureIndexes() {
  await connectDB();

  for (const model of MODELS) {
    // eslint-disable-next-line no-await-in-loop
    await model.syncIndexes();
    logger.info({ model: model.modelName }, 'Indexes synced.');
  }

  logger.info('All indexes synced successfully.');
}

if (require.main === module) {
  ensureIndexes()
    .then(() => disconnectDB())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'Index sync failed.');
      process.exit(1);
    });
}

module.exports = { ensureIndexes, MODELS };
