'use strict';

const equipmentRepository = require('./equipment.repository');
const { resolvePagination, paginatedResponse } = require('../../utils/pagination');
const { ApiError } = require('../../middleware/errorHandler');
const metrics = require('../../observability/metrics');
const logger = require('../../observability/logger');

// `ownerId` is ALWAYS req.user.id — never accepted from the request
// body (section 10: "never trust ownerId from the client").
async function createEquipment(ownerId, payload) {
  const equipment = await equipmentRepository.create({ ...payload, ownerId });
  metrics.increment('listing_created_total');
  logger.info({ ownerId, equipmentId: String(equipment._id) }, 'listing_created');
  return equipment;
}

async function discover(query) {
  const { page, limit, skip } = resolvePagination(query);
  const { items, total } = await equipmentRepository.discover({
    equipmentType: query.equipmentType,
    governorate: query.governorate,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    condition: query.condition,
    operatorAvailable: query.operatorAvailable,
    skip,
    limit,
  });
  return paginatedResponse(items, total, { page, limit });
}

async function getDiscoverableById(equipmentId) {
  const equipment = await equipmentRepository.findDiscoverableById(equipmentId);
  if (!equipment) {
    throw ApiError.notFound('Equipment listing not found.');
  }
  return equipment;
}

async function listMine(ownerId, query) {
  const { page, limit, skip } = resolvePagination(query);
  const { items, total } = await equipmentRepository.listForOwner(ownerId, { skip, limit });
  return paginatedResponse(items, total, { page, limit });
}

/** `equipment` is the ownership-checked document (req.equipment). */
async function updateEquipment(equipment, updates) {
  return equipmentRepository.updateById(equipment._id, updates);
}

async function archiveEquipment(equipment) {
  return equipmentRepository.updateById(equipment._id, { status: 'archived' });
}

async function moderateEquipment(equipment, status) {
  metrics.increment('moderation_action_total');
  logger.info({ equipmentId: String(equipment._id), status }, 'moderation_action');
  return equipmentRepository.updateById(equipment._id, { moderationStatus: status });
}

module.exports = {
  createEquipment,
  discover,
  getDiscoverableById,
  listMine,
  updateEquipment,
  archiveEquipment,
  moderateEquipment,
};
