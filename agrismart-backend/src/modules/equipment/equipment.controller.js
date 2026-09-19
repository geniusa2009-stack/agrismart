'use strict';

const equipmentService = require('./equipment.service');
const equipmentRepository = require('./equipment.repository');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');

const create = asyncHandler(async (req, res) => {
  const equipment = await equipmentService.createEquipment(req.user.id, req.body);
  res.status(201).json({ success: true, data: equipment });
});

const discover = asyncHandler(async (req, res) => {
  const result = await equipmentService.discover(req.query);
  res.status(200).json({ success: true, data: result.items, pagination: result.pagination });
});

const getById = asyncHandler(async (req, res) => {
  const equipment = await equipmentService.getDiscoverableById(req.params.equipmentId);
  res.status(200).json({ success: true, data: equipment });
});

const listMine = asyncHandler(async (req, res) => {
  const result = await equipmentService.listMine(req.user.id, req.query);
  res.status(200).json({ success: true, data: result.items, pagination: result.pagination });
});

// req.equipment attached by authorizeResourceOwnership.
const update = asyncHandler(async (req, res) => {
  const equipment = await equipmentService.updateEquipment(req.equipment, req.body);
  res.status(200).json({ success: true, data: equipment });
});

const remove = asyncHandler(async (req, res) => {
  await equipmentService.archiveEquipment(req.equipment);
  res.status(204).send();
});

const moderate = asyncHandler(async (req, res) => {
  const equipment = await equipmentService.moderateEquipment(req.equipment, req.body.status);
  res.status(200).json({ success: true, data: equipment });
});

/**
 * Loader for the rental-request creation route: only a currently
 * discoverable (active + visible) listing can be rented — same
 * reasoning as posts.controller.loadVisiblePost.
 */
const loadDiscoverableEquipment = asyncHandler(async (req, res, next) => {
  const equipment = await equipmentRepository.findDiscoverableById(req.params.equipmentId);
  if (!equipment) {
    throw ApiError.notFound('Equipment listing not found or not available.');
  }
  req.equipment = equipment;
  next();
});

module.exports = { create, discover, getById, listMine, update, remove, moderate, loadDiscoverableEquipment };
