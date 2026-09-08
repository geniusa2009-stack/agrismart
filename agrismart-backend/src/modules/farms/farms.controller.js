'use strict';

const farmsService = require('./farms.service');
const { asyncHandler } = require('../../middleware/errorHandler');

const create = asyncHandler(async (req, res) => {
  const farm = await farmsService.createFarm({ ownerId: req.user.id, ...req.body });
  res.status(201).json({ success: true, data: farm });
});

const list = asyncHandler(async (req, res) => {
  const farms = await farmsService.listFarms(req.user);
  res.status(200).json({ success: true, data: farms });
});

// Ownership already verified by authorizeFarmOwnership middleware,
// which attached req.farm — this controller never re-derives access.
const getById = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: req.farm });
});

const update = asyncHandler(async (req, res) => {
  const farm = await farmsService.updateFarm(req.farm, req.body);
  res.status(200).json({ success: true, data: farm });
});

const remove = asyncHandler(async (req, res) => {
  await farmsService.deleteFarm(req.farm);
  res.status(204).send();
});

module.exports = { create, list, getById, update, remove };
