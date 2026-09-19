'use strict';

const AgriculturalService = require('./agriculturalService.model');

async function create(payload) {
  return AgriculturalService.create(payload);
}

async function findByIdPlain(serviceId) {
  return AgriculturalService.findById(serviceId);
}

async function findDiscoverableById(serviceId) {
  return AgriculturalService.findOne({ _id: serviceId, status: 'active', moderationStatus: 'visible' });
}

async function discover({ serviceType, governorate, minPrice, maxPrice, skip, limit }) {
  const query = { status: 'active', moderationStatus: 'visible' };
  if (serviceType) query.serviceType = serviceType;
  if (governorate) query['location.governorate'] = governorate;
  if (minPrice !== undefined || maxPrice !== undefined) {
    query['pricing.amount'] = {};
    if (minPrice !== undefined) query['pricing.amount'].$gte = minPrice;
    if (maxPrice !== undefined) query['pricing.amount'].$lte = maxPrice;
  }
  const [items, total] = await Promise.all([
    AgriculturalService.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AgriculturalService.countDocuments(query),
  ]);
  return { items, total };
}

async function listForProvider(providerId, { skip, limit }) {
  const query = { providerId };
  const [items, total] = await Promise.all([
    AgriculturalService.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AgriculturalService.countDocuments(query),
  ]);
  return { items, total };
}

async function updateById(serviceId, updates) {
  return AgriculturalService.findByIdAndUpdate(serviceId, { $set: updates }, { new: true });
}

async function applyRatingDelta(serviceId, { newAverage, newCount }) {
  return AgriculturalService.findByIdAndUpdate(serviceId, { $set: { ratingAverage: newAverage, ratingCount: newCount } });
}

module.exports = { create, findByIdPlain, findDiscoverableById, discover, listForProvider, updateById, applyRatingDelta };
