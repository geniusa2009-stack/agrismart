'use strict';

const express = require('express');
const controller = require('./telemetry.controller');
const validate = require('../../middleware/validate');
const authenticateDevice = require('../../middleware/authenticateDevice');
const { deviceIngestLimiter } = require('../../middleware/rateLimiter');
const { telemetryIngestSchema } = require('./telemetry.validators');

const router = express.Router();

router.post(
  '/',
  authenticateDevice,
  deviceIngestLimiter,
  validate(telemetryIngestSchema),
  controller.ingest
);

module.exports = router;
