'use strict';

const commandsService = require('./commands.service');
const irrigationService = require('../irrigation/irrigation.service');
const { asyncHandler } = require('../../middleware/errorHandler');

// Called by the device itself (authenticateDevice), confirming it
// received the command — proves transport delivery only, never
// physical execution (Stage 2 section 9).
const acknowledge = asyncHandler(async (req, res) => {
  const command = await commandsService.acknowledge(req.params.commandId, req.device.deviceId);
  res.status(200).json({ success: true, data: command });
});

// Called by the device itself, reporting what ACTUALLY happened. This
// is the only path that can mark a command COMPLETED/FAILED, and the
// only path that updates a valve's confirmedState.
const reportExecutionResult = asyncHandler(async (req, res) => {
  const { success, details, valveId, confirmedValveState } = req.body;

  const command = await commandsService.reportExecutionResult(req.params.commandId, req.device.deviceId, {
    success,
    details,
  });

  if (valveId && confirmedValveState) {
    await irrigationService.confirmValveState(valveId, confirmedValveState);
  }

  res.status(200).json({ success: true, data: command });
});

module.exports = { acknowledge, reportExecutionResult };
