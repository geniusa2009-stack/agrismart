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
const aiRoutes = require('../modules/ai/ai.routes');

// Agricultural Community + Marketplace layer (Overnight Community task).
const communityRoutes = require('../modules/community/community.routes');
const moderationRoutes = require('../modules/moderation/moderation.routes');
const notificationsRoutes = require('../modules/notifications/notifications.routes');
const equipmentRoutes = require('../modules/equipment/equipment.routes');
const rentalsRoutes = require('../modules/equipment/rentals.routes');
const servicesRoutes = require('../modules/services/services.routes');
const serviceRequestsRoutes = require('../modules/services/serviceRequests.routes');
const marketplaceRoutes = require('../modules/marketplace/marketplace.routes');

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
apiV1.use('/ai', aiRoutes);

apiV1.use('/community', communityRoutes);
apiV1.use('/moderation', moderationRoutes);
apiV1.use('/notifications', notificationsRoutes);
apiV1.use('/equipment', equipmentRoutes);
apiV1.use('/rentals', rentalsRoutes);
apiV1.use('/services', servicesRoutes);
apiV1.use('/service-requests', serviceRequestsRoutes);
apiV1.use('/marketplace', marketplaceRoutes);

router.use('/api/v1', apiV1);

module.exports = router;
