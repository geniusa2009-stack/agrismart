'use strict';

/**
 * routes/index.js
 *
 * Mounts /health (unversioned infrastructure endpoints) and every
 * business module under /api/v1 (Stage 2 section 11).
 */

const express = require('express');

const healthRoutes = require('../modules/health/health.routes');
const authRoutes = require('../modules/auth/auth.routes');
const farmsRoutes = require('../modules/farms/farms.routes');
const devicesRoutes = require('../modules/devices/devices.routes');
const telemetryRoutes = require('../modules/telemetry/telemetry.routes');
const commandsRoutes = require('../modules/commands/commands.routes');
const irrigationRoutes = require('../modules/irrigation/irrigation.routes');
const dashboardRoutes = require('../modules/dashboard/dashboard.routes');
const usersRoutes = require('../modules/users/users.routes');

const router = express.Router();

router.use('/health', healthRoutes);

const apiV1 = express.Router();
apiV1.use('/auth', authRoutes);
apiV1.use('/farms', farmsRoutes);
apiV1.use('/devices', devicesRoutes);
apiV1.use('/telemetry', telemetryRoutes);
apiV1.use('/commands', commandsRoutes);
apiV1.use('/irrigation', irrigationRoutes);
apiV1.use('/dashboard', dashboardRoutes);
apiV1.use('/users', usersRoutes);

router.use('/api/v1', apiV1);

module.exports = router;
