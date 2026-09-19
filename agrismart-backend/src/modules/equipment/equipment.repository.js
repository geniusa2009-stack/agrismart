'use strict';

const Equipment = require('./equipment.model');

async function create(payload) {
  return Equipment.create(payload);
}

async function findByIdPlain(equipmentId) {
  return Equipment.findById(equipmentId);
}

async function findDiscoverableById(equipmentId) {
  return Equipment.findOne({ _id: equipmentId, status: 'active', moderationStatus: 'visible' });
}

/**
 * Discovery query — every filter maps directly onto an indexed field
 * (see equipment.model.js's compound indexes), and the result set is
 * ALWAYS bounded by skip/limit (section 6/24: never load the whole
 * collection into memory).
 */
async function discover({ equipmentType, governorate, minPrice, maxPrice, condition, operatorAvailable, skip, limit }) {
  const query = { status: 'active', moderationStatus: 'visible' };
  if (equipmentType) query.equipmentType = equipmentType;
  if (governorate) query['location.governorate'] = governorate;
  if (condition) query.condition = condition;
  if (operatorAvailable !== undefined) query.operatorAvailable = operatorAvailable;
  if (minPrice !== undefined || maxPrice !== undefined) {
    query['pricing.amount'] = {};
    if (minPrice !== undefined) query['pricing.amount'].$gte = minPrice;
    if (maxPrice !== undefined) query['pricing.amount'].$lte = maxPrice;
  }

  const [items, total] = await Promise.all([
    Equipment.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Equipment.countDocuments(query),
  ]);
  return { items, total };
}

async function listForOwner(ownerId, { skip, limit }) {
  const query = { ownerId };
  const [items, total] = await Promise.all([
    Equipment.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Equipment.countDocuments(query),
  ]);
  return { items, total };
}

async function updateById(equipmentId, updates) {
  return Equipment.findByIdAndUpdate(equipmentId, { $set: updates }, { new: true });
}

async function applyRatingDelta(equipmentId, { newAverage, newCount }) {
  return Equipment.findByIdAndUpdate(equipmentId, { $set: { ratingAverage: newAverage, ratingCount: newCount } });
}

module.exports = {
  create,
  findByIdPlain,
  findDiscoverableById,
  discover,
  listForOwner,
  updateById,
  applyRatingDelta,
};
