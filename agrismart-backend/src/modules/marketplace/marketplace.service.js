'use strict';

const marketplaceRepository = require('./marketplace.repository');
const savedItemsRepository = require('./savedItems.repository');
const notificationsService = require('../notifications/notifications.service');
const { resolvePagination, paginatedResponse } = require('../../utils/pagination');
const { ApiError } = require('../../middleware/errorHandler');
const metrics = require('../../observability/metrics');
const logger = require('../../observability/logger');

async function createListing(sellerId, payload) {
  const listing = await marketplaceRepository.create({ ...payload, sellerId });
  metrics.increment('listing_created_total');
  logger.info({ sellerId, listingId: String(listing._id) }, 'listing_created');
  return listing;
}

async function discover(query) {
  const { page, limit, skip } = resolvePagination(query);
  const { items, total } = await marketplaceRepository.discover({
    category: query.category,
    governorate: query.governorate,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    availability: query.availability,
    skip,
    limit,
  });
  return paginatedResponse(items, total, { page, limit });
}

async function getDiscoverableById(listingId) {
  const listing = await marketplaceRepository.findDiscoverableById(listingId);
  if (!listing) {
    throw ApiError.notFound('Marketplace listing not found.');
  }
  return listing;
}

async function listMine(sellerId, query) {
  const { page, limit, skip } = resolvePagination(query);
  const { items, total } = await marketplaceRepository.listForSeller(sellerId, { skip, limit });
  return paginatedResponse(items, total, { page, limit });
}

async function updateListing(listing, updates) {
  return marketplaceRepository.updateById(listing._id, updates);
}

async function archiveListing(listing) {
  return marketplaceRepository.updateById(listing._id, { status: 'archived' });
}

async function moderateListing(listing, status) {
  metrics.increment('moderation_action_total');
  logger.info({ listingId: String(listing._id), status }, 'moderation_action');
  return marketplaceRepository.updateById(listing._id, { moderationStatus: status });
}

/**
 * "Seller contact/request" (section 8) — the MVP substitute for a full
 * messaging/checkout system: a bounded inquiry message delivered as a
 * notification to the seller, carrying the buyer's id so the seller
 * can view their profile and decide how to follow up. No conversation
 * thread/inbox exists yet (SavedItem/Conversation/Message are listed
 * as "future-ready" in the brief, not required this pass).
 */
async function contactSeller(buyerId, listing, message) {
  if (String(listing.sellerId) === String(buyerId)) {
    throw ApiError.badRequest('You cannot contact yourself about your own listing.');
  }
  metrics.increment('marketplace_inquiry_total');
  await notificationsService.notify({
    userId: listing.sellerId,
    type: 'marketplace_inquiry',
    data: { listingId: String(listing._id), buyerId, message },
  });
  return { sent: true };
}

async function toggleSave(userId, targetType, targetId) {
  const existing = await savedItemsRepository.findOne(userId, targetType, targetId);
  if (existing) {
    await savedItemsRepository.remove(userId, targetType, targetId);
    return { saved: false };
  }
  try {
    await savedItemsRepository.create({ userId, targetType, targetId });
    return { saved: true };
  } catch (err) {
    if (err && err.code === 11000) return { saved: true };
    throw err;
  }
}

async function listSaved(userId, query) {
  const { page, limit, skip } = resolvePagination(query);
  const { items, total } = await savedItemsRepository.listForUser(userId, { targetType: query.targetType, skip, limit });
  return paginatedResponse(items, total, { page, limit });
}

module.exports = {
  createListing,
  discover,
  getDiscoverableById,
  listMine,
  updateListing,
  archiveListing,
  moderateListing,
  contactSeller,
  toggleSave,
  listSaved,
};
