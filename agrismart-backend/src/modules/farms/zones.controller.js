'use strict';

const zonesService = require('./zones.service');
const zonesRepository = require('./zones.repository');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');

// req.farm attached by authorizeFarmOwnership on this route.
const create = asyncHandler(async (req, res) => {
  const zone = await zonesService.createZone({ farmId: req.farm._id, ...req.body });
  res.status(201).json({ success: true, data: zone });
});

const listForFarm = asyncHandler(async (req, res) => {
  const zones = await zonesService.listZonesForFarm(req.farm._id);
  res.status(200).json({ success: true, data: zones });
});

// req.zone attached by the loadZone middleware below (ownership-checked).
const getById = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: req.zone });
});

const update = asyncHandler(async (req, res) => {
  const zone = await zonesService.updateZone(req.zone, req.body);
  res.status(200).json({ success: true, data: zone });
});

const remove = asyncHandler(async (req, res) => {
  await zonesService.deleteZone(req.zone);
  res.status(204).send();
});

/**
 * Loads a zone by id and enforces ownership (same anti-IDOR pattern as
 * irrigation.controller.js's loadValve) — a farmer must never reach
 * another farmer's zone by guessing/changing a zoneId in the URL.
 */
const loadZone = asyncHandler(async (req, res, next) => {
  const zone = await zonesRepository.findByIdForPrincipal(req.params.zoneId, req.user);
  if (!zone) {
    return next(ApiError.notFound('Zone not found.'));
  }
  req.zone = zone;
  next();
});

module.exports = { create, listForFarm, getById, update, remove, loadZone };
