'use strict';

const express = require('express');
const controller = require('./commands.controller');
const validate = require('../../middleware/validate');
const authenticateDevice = require('../../middleware/authenticateDevice');
const { deviceIngestLimiter } = require('../../middleware/rateLimiter');
const { commandIdParamsSchema, executionResultSchema } = require('./commands.validators');

const router = express.Router();

router.use(authenticateDevice, deviceIngestLimiter);

router.post('/:commandId/ack', validate(commandIdParamsSchema, 'params'), controller.acknowledge);
router.post(
  '/:commandId/result',
  validate(commandIdParamsSchema, 'params'),
  validate(executionResultSchema),
  controller.reportExecutionResult
);

module.exports = router;
