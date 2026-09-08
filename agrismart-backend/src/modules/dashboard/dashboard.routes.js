'use strict';

/**
 * modules/dashboard/dashboard.routes.js
 *
 * MVP/demo pass: read-only endpoints composed for the frontend
 * dashboard. Every route requires authentication; farm-scoped routes
 * reuse the existing anti-IDOR authorizeFarmOwnership check
 * (middleware/authorizeOwnership.js — the same one farms.routes.js
 * uses), and device-scoped routes reuse authorizeDeviceFarmAccess
 * (middleware/authorizeFarmAccess.js) so a device's telemetry/commands
 * can't be read by a user who doesn't own that device's farm.
 */

const express = require('express');
const controller = require('./dashboard.controller');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { authorizeFarmOwnership } = require('../../middleware/authorizeOwnership');
const { authorizeDeviceFarmAccess } = require('../../middleware/authorizeFarmAccess');
const { farmIdParamsSchema, deviceIdParamsSchema, telemetryRangeQuerySchema, alertParamsSchema } = require('./dashboard.validators');

const router = express.Router();

router.use(authenticate);

router.get(
  '/farms/:farmId/summary',
  validate(farmIdParamsSchema, 'params'),
  authorizeFarmOwnership('farmId'),
  controller.getFarmSummary
);

router.get(
  '/farms/:farmId/devices',
  validate(farmIdParamsSchema, 'params'),
  authorizeFarmOwnership('farmId'),
  controller.listDevices
);

router.get(
  '/farms/:farmId/valves',
  validate(farmIdParamsSchema, 'params'),
  authorizeFarmOwnership('farmId'),
  controller.listValves
);

router.get(
  '/farms/:farmId/alerts',
  validate(farmIdParamsSchema, 'params'),
  authorizeFarmOwnership('farmId'),
  controller.listAlerts
);

router.get(
  '/farms/:farmId/commands',
  validate(farmIdParamsSchema, 'params'),
  authorizeFarmOwnership('farmId'),
  controller.listFarmCommands
);

router.post(
  '/farms/:farmId/alerts/:alertId/acknowledge',
  validate(alertParamsSchema, 'params'),
  authorizeFarmOwnership('farmId'),
  controller.acknowledgeAlert
);

router.delete(
  '/farms/:farmId/alerts/:alertId/acknowledge',
  validate(alertParamsSchema, 'params'),
  authorizeFarmOwnership('farmId'),
  controller.unacknowledgeAlert
);

router.get(
  '/devices/:deviceId',
  validate(deviceIdParamsSchema, 'params'),
  authorizeDeviceFarmAccess('deviceId'),
  controller.getDevice
);

router.get(
  '/devices/:deviceId/telemetry',
  validate(deviceIdParamsSchema, 'params'),
  authorizeDeviceFarmAccess('deviceId'),
  validate(telemetryRangeQuerySchema, 'query'),
  controller.getDeviceTelemetry
);

router.get(
  '/devices/:deviceId/commands',
  validate(deviceIdParamsSchema, 'params'),
  authorizeDeviceFarmAccess('deviceId'),
  controller.getDeviceCommands
);

module.exports = router;
