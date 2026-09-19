'use strict';

const RentalRequest = require('./rentalRequest.model');

async function create(payload) {
  return RentalRequest.create(payload);
}

async function findByIdPlain(rentalId) {
  return RentalRequest.findById(rentalId);
}

/**
 * Any ACCEPTED request for this equipment whose [startDate, endDate]
 * range overlaps the given range — the actual "is this equipment
 * available" check (section 5/22). Standard interval-overlap query:
 * two ranges [a,b] and [c,d] overlap iff a < d AND c < b.
 * `excludeRequestId` lets the accept-time re-check exclude the request
 * being accepted itself.
 */
async function findOverlappingAccepted(equipmentId, startDate, endDate, excludeRequestId) {
  const query = {
    equipmentId,
    status: 'accepted',
    startDate: { $lt: endDate },
    endDate: { $gt: startDate },
  };
  if (excludeRequestId) {
    query._id = { $ne: excludeRequestId };
  }
  return RentalRequest.findOne(query);
}

async function listForRequester(requesterId, { status, skip, limit }) {
  const query = { requesterId };
  if (status) query.status = status;
  const [items, total] = await Promise.all([
    RentalRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    RentalRequest.countDocuments(query),
  ]);
  return { items, total };
}

async function listForOwner(ownerId, { status, skip, limit }) {
  const query = { ownerId };
  if (status) query.status = status;
  const [items, total] = await Promise.all([
    RentalRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    RentalRequest.countDocuments(query),
  ]);
  return { items, total };
}

/**
 * Atomic, single-document compare-and-swap: only transitions if the
 * request is STILL in `fromStatus` at the moment of the write — this
 * is what actually prevents two concurrent accept/reject calls on the
 * same request from both succeeding (section 22), independent of the
 * separate overlap check in rentals.service.js.
 */
async function transition(rentalId, fromStatuses, toStatus, updates = {}) {
  return RentalRequest.findOneAndUpdate(
    { _id: rentalId, status: { $in: fromStatuses } },
    { $set: { status: toStatus, ...updates } },
    { new: true }
  );
}

async function setStatus(rentalId, status, updates = {}) {
  return RentalRequest.findByIdAndUpdate(rentalId, { $set: { status, ...updates } }, { new: true });
}

/**
 * Rollback path used only by rentals.service.acceptRental's post-write
 * race check — reverts status to 'requested' AND clears the
 * respondedBy/respondedAt/responseNote fields the aborted accept wrote,
 * so the audit trail doesn't retain a stale "accepted by X at T" for a
 * request that is, in the end, still pending.
 */
async function rollbackToRequested(rentalId) {
  return RentalRequest.findByIdAndUpdate(
    rentalId,
    {
      $set: { status: 'requested' },
      $unset: { respondedBy: '', respondedAt: '', responseNote: '' },
    },
    { new: true }
  );
}

module.exports = {
  create,
  findByIdPlain,
  findOverlappingAccepted,
  listForRequester,
  listForOwner,
  transition,
  setStatus,
  rollbackToRequested,
};
