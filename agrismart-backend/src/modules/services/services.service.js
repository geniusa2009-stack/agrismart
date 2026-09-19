'use strict';

const servicesRepository = require('./services.repository');
const { resolvePagination, paginatedResponse } = require('../../utils/pagination');
const { ApiError } = require('../../middleware/errorHandler');
const metrics = require('../../observability/metrics');
const logger = require('../../observability/logger');

async function createService(providerId, payload) {
  const service = await servicesRepository.create({ ...payload, providerId });
  metrics.increment('listing_created_total');
  logger.info({ providerId, serviceId: String(service._id) }, 'listing_created');
  return service;
}

async function discover(query) {
  const { page, limit, skip } = resolvePagination(query);
  const { items, total } = await servicesRepository.discover({
    serviceType: query.serviceType,
    governorate: query.governorate,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    skip,
    limit,
  });
  return paginatedResponse(items, total, { page, limit });
}

async function getDiscoverableById(serviceId) {
  const service = await servicesRepository.findDiscoverableById(serviceId);
  if (!service) {
    throw ApiError.notFound('Service listing not found.');
  }
  return service;
}

async function listMine(providerId, query) {
  const { page, limit, skip } = resolvePagination(query);
  const { items, total } = await servicesRepository.listForProvider(providerId, { skip, limit });
  return paginatedResponse(items, total, { page, limit });
}

async function updateService(service, updates) {
  return servicesRepository.updateById(service._id, updates);
}

async function archiveService(service) {
  return servicesRepository.updateById(service._id, { status: 'archived' });
}

async function moderateService(service, status) {
  metrics.increment('moderation_action_total');
  logger.info({ serviceId: String(service._id), status }, 'moderation_action');
  return servicesRepository.updateById(service._id, { moderationStatus: status });
}

module.exports = { createService, discover, getDiscoverableById, listMine, updateService, archiveService, moderateService };
