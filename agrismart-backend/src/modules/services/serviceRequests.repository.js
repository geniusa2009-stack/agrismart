'use strict';

const ServiceRequest = require('./serviceRequest.model');

async function create(payload) {
  return ServiceRequest.create(payload);
}

async function findByIdPlain(requestId) {
  return ServiceRequest.findById(requestId);
}

async function listForRequester(requesterId, { status, skip, limit }) {
  const query = { requesterId };
  if (status) query.status = status;
  const [items, total] = await Promise.all([
    ServiceRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ServiceRequest.countDocuments(query),
  ]);
  return { items, total };
}

async function listForProvider(providerId, { status, skip, limit }) {
  const query = { providerId };
  if (status) query.status = status;
  const [items, total] = await Promise.all([
    ServiceRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ServiceRequest.countDocuments(query),
  ]);
  return { items, total };
}

/** Atomic compare-and-swap — same single-document-transition safety
 * pattern as rentals.repository.transition() / commands.service.js. */
async function transition(requestId, fromStatuses, toStatus, updates = {}) {
  return ServiceRequest.findOneAndUpdate(
    { _id: requestId, status: { $in: fromStatuses } },
    { $set: { status: toStatus, ...updates } },
    { new: true }
  );
}

/** Mirrors rentalsRepository's post-review flag update — a plain
 * $set, not a transition() compare-and-swap, since this never changes
 * `status` (a completed request stays completed after being reviewed). */
async function markReviewed(requestId) {
  return ServiceRequest.findByIdAndUpdate(requestId, { $set: { reviewedByRequester: true } }, { new: true });
}

module.exports = { create, findByIdPlain, listForRequester, listForProvider, transition, markReviewed };
