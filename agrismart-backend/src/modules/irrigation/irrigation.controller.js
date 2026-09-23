'use strict';

const irrigationService = require('./irrigation.service');
const irrigationRepository = require('./irrigation.repository');
const Valve = require('./valve.model');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');

const createValve = asyncHandler(async (req, res) => {
  // req.farm attached by authorizeFarmOwnership on this route.
  const valve = await irrigationService.createValve({
    farmId: req.farm._id,
    deviceId: req.body.deviceId,
    name: req.body.name,
  });
  res.status(201).json({ success: true, data: valve });
});

// req.valve attached by the loadValve middleware below (ownership-checked).
const openValve = asyncHandler(async (req, res) => {
  const result = await irrigationService.openValve({
    valve: req.valve,
    requestedDurationSeconds: req.body.requestedDurationSeconds,
    userId: req.user.id,
    triggeredBy: 'manual',
    idempotencyKey: req.body.idempotencyKey,
  });
  res.status(202).json({ success: true, data: result });
});

const closeValve = asyncHandler(async (req, res) => {
  const result = await irrigationService.closeValve({
    valve: req.valve,
    userId: req.user.id,
    idempotencyKey: req.body.idempotencyKey,
  });
  res.status(202).json({ success: true, data: result });
});

const emergencyStop = asyncHandler(async (req, res) => {
  // req.farm attached by authorizeFarmOwnership.
  const valves = await Valve.find({ farmId: req.farm._id });
  const results = await irrigationService.emergencyStopFarm({
    farmId: req.farm._id,
    valves,
    userId: req.user.id,
  });
  res.status(202).json({ success: true, data: results });
});

/**
 * Loads a valve by id and enforces ownership (Stage 2 section 6 anti-
 * IDOR pattern, applied here the same way authorizeOwnership.js applies
 * it to farms) — a farmer must never be able to open/close another
 * farmer's valve by guessing/changing a valveId in the URL.
 */
const loadValve = asyncHandler(async (req, res, next) => {
  const valve = await irrigationRepository.findValveByIdForPrincipal(req.params.valveId, req.user);
  if (!valve) {
    return next(ApiError.notFound('Valve not found.'));
  }
  req.valve = valve;
  next();
});

const updateAutomation = asyncHandler(async (req, res) => {
  const valve = await irrigationService.updateAutomationSettings(req.valve, req.body);
  res.status(200).json({ success: true, data: valve });
});

const assignZone = asyncHandler(async (req, res) => {
  const valve = await irrigationService.assignValveZone(req.valve, req.body.zoneId);
  res.status(200).json({ success: true, data: valve });
});

module.exports = { createValve, openValve, closeValve, emergencyStop, loadValve, updateAutomation, assignZone };
