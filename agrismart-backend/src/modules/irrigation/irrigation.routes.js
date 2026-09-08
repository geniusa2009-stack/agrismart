'use strict';

const express = require('express');
const controller = require('./irrigation.controller');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { authorizeFarmOwnership } = require('../../middleware/authorizeOwnership');
const { commandLimiter } = require('../../middleware/rateLimiter');
const {
  createValveSchema,
  valveIdParamsSchema,
  openValveSchema,
  closeValveSchema,
  farmIdParamsSchema,
  automationSettingsSchema,
} = require('./irrigation.validators');

const router = express.Router();

router.use(authenticate);

router.post(
  '/farms/:farmId/valves',
  validate(farmIdParamsSchema, 'params'),
  authorizeFarmOwnership('farmId'),
  validate(createValveSchema),
  controller.createValve
);

router.post(
  '/valves/:valveId/open',
  validate(valveIdParamsSchema, 'params'),
  controller.loadValve,
  commandLimiter,
  validate(openValveSchema),
  controller.openValve
);

router.post(
  '/valves/:valveId/close',
  validate(valveIdParamsSchema, 'params'),
  controller.loadValve,
  commandLimiter,
  validate(closeValveSchema),
  controller.closeValve
);

router.patch(
  '/valves/:valveId/automation',
  validate(valveIdParamsSchema, 'params'),
  controller.loadValve,
  validate(automationSettingsSchema),
  controller.updateAutomation
);

// Emergency stop deliberately does NOT go through commandLimiter
// (Stage 2 section 10: "always allowed regardless of rate limits or
// normal auth throttle").
router.post(
  '/farms/:farmId/emergency-stop',
  validate(farmIdParamsSchema, 'params'),
  authorizeFarmOwnership('farmId'),
  controller.emergencyStop
);

module.exports = router;
