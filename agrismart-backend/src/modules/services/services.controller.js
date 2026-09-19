'use strict';

const servicesService = require('./services.service');
const servicesRepository = require('./services.repository');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');

const create = asyncHandler(async (req, res) => {
  const service = await servicesService.createService(req.user.id, req.body);
  res.status(201).json({ success: true, data: service });
});

const discover = asyncHandler(async (req, res) => {
  const result = await servicesService.discover(req.query);
  res.status(200).json({ success: true, data: result.items, pagination: result.pagination });
});

const getById = asyncHandler(async (req, res) => {
  const service = await servicesService.getDiscoverableById(req.params.serviceId);
  res.status(200).json({ success: true, data: service });
});

const listMine = asyncHandler(async (req, res) => {
  const result = await servicesService.listMine(req.user.id, req.query);
  res.status(200).json({ success: true, data: result.items, pagination: result.pagination });
});

const update = asyncHandler(async (req, res) => {
  const service = await servicesService.updateService(req.service, req.body);
  res.status(200).json({ success: true, data: service });
});

const remove = asyncHandler(async (req, res) => {
  await servicesService.archiveService(req.service);
  res.status(204).send();
});

const moderate = asyncHandler(async (req, res) => {
  const service = await servicesService.moderateService(req.service, req.body.status);
  res.status(200).json({ success: true, data: service });
});

const loadDiscoverableService = asyncHandler(async (req, res, next) => {
  const service = await servicesRepository.findDiscoverableById(req.params.serviceId);
  if (!service) {
    throw ApiError.notFound('Service listing not found or not available.');
  }
  req.service = service;
  next();
});

module.exports = { create, discover, getById, listMine, update, remove, moderate, loadDiscoverableService };
