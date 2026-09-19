'use strict';

const MarketplaceListing = require('./marketplaceListing.model');

async function create(payload) {
  return MarketplaceListing.create(payload);
}

async function findByIdPlain(listingId) {
  return MarketplaceListing.findById(listingId);
}

async function findDiscoverableById(listingId) {
  return MarketplaceListing.findOne({ _id: listingId, status: 'active', moderationStatus: 'visible' });
}

async function discover({ category, governorate, minPrice, maxPrice, availability, skip, limit }) {
  const query = { status: 'active', moderationStatus: 'visible' };
  if (category) query.category = category;
  if (governorate) query['location.governorate'] = governorate;
  if (availability) query.availability = availability;
  if (minPrice !== undefined || maxPrice !== undefined) {
    query.price = {};
    if (minPrice !== undefined) query.price.$gte = minPrice;
    if (maxPrice !== undefined) query.price.$lte = maxPrice;
  }
  const [items, total] = await Promise.all([
    MarketplaceListing.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    MarketplaceListing.countDocuments(query),
  ]);
  return { items, total };
}

async function listForSeller(sellerId, { skip, limit }) {
  const query = { sellerId };
  const [items, total] = await Promise.all([
    MarketplaceListing.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    MarketplaceListing.countDocuments(query),
  ]);
  return { items, total };
}

async function updateById(listingId, updates) {
  return MarketplaceListing.findByIdAndUpdate(listingId, { $set: updates }, { new: true });
}

module.exports = { create, findByIdPlain, findDiscoverableById, discover, listForSeller, updateById };
