'use strict';

/**
 * modules/equipment/rentals.service.js
 *
 * Owns the entire rental request lifecycle:
 *   requested -> accepted -> completed
 *            -> rejected
 *   requested|accepted -> cancelled
 *
 * Double-booking prevention (section 5/22) — the concurrency-safety
 * limitation this file documents up front:
 *
 *   This backend runs against a standalone (non-replica-set) MongoDB
 *   in local/demo use (see agrismart-backend/DEMO.md), so Mongo
 *   multi-document ACID transactions are NOT assumed to be available
 *   here — using `session.startTransaction()` would either throw or
 *   silently degrade depending on deployment topology. Full
 *   transactional guarantees are therefore NOT used. Instead, the
 *   strongest safe mechanism available without them is applied:
 *
 *     1. An optimistic overlap check before accepting.
 *     2. An ATOMIC single-document compare-and-swap on the request
 *        being accepted itself (`status: 'requested' -> 'accepted'`,
 *        via rentals.repository.transition()'s conditional
 *        findOneAndUpdate) — this alone fully prevents the same
 *        request from being double-accepted by concurrent calls.
 *     3. A second overlap check performed AFTER that atomic write,
 *        specifically to catch the narrow race where two DIFFERENT
 *        requests for the same equipment/overlapping dates were both
 *        accepted concurrently. If caught, the just-written accept is
 *        rolled back to 'requested' and a 409 is returned.
 *
 *   This closes the window to the single remaining race between steps
 *   2 and 3 (vanishingly small in practice — a rental-accept action is
 *   deliberate, human-paced, not a tight request loop like the IoT
 *   command layer). A future deployment on a MongoDB replica set could
 *   remove even that gap with a real transaction wrapping steps 2-3;
 *   this is called out explicitly rather than silently accepted as
 *   airtight.
 */

const rentalsRepository = require('./rentals.repository');
const equipmentRepository = require('./equipment.repository');
const notificationsService = require('../notifications/notifications.service');
const reviewsService = require('../trust/reviews.service');
const { resolvePagination, paginatedResponse } = require('../../utils/pagination');
const { ApiError } = require('../../middleware/errorHandler');
const metrics = require('../../observability/metrics');
const logger = require('../../observability/logger');

async function requestRental(requesterId, equipment, { startDate, endDate, message }) {
  if (String(equipment.ownerId) === String(requesterId)) {
    throw ApiError.badRequest('You cannot rent your own equipment.');
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (!(start < end)) {
    throw ApiError.badRequest('endDate must be after startDate.');
  }
  if (start < new Date(Date.now() - 60 * 1000)) {
    throw ApiError.badRequest('startDate cannot be in the past.');
  }

  const overlap = await rentalsRepository.findOverlappingAccepted(equipment._id, start, end);
  if (overlap) {
    throw ApiError.conflict('This equipment is already booked for the requested dates.');
  }

  const rental = await rentalsRepository.create({
    equipmentId: equipment._id,
    ownerId: equipment.ownerId,
    requesterId,
    startDate: start,
    endDate: end,
    pricingUnit: equipment.pricing.unit,
    priceQuoted: equipment.pricing.amount,
    message,
  });

  metrics.increment('rental_requested_total');
  logger.info({ rentalId: String(rental._id), equipmentId: String(equipment._id), requesterId }, 'rental_requested');
  await notificationsService.notify({
    userId: equipment.ownerId,
    type: 'rental_requested',
    data: { rentalId: String(rental._id), equipmentId: String(equipment._id) },
  });

  return rental;
}

/**
 * `rental` is already loaded (req.rental). Only the OWNER may accept —
 * this is re-checked here in the service layer, not just in route
 * middleware, per the existing codebase's own stated principle
 * (security/rbac.js's isPrincipalAuthorizedForFarm comment: authorization
 * "must not depend exclusively on controllers").
 */
async function acceptRental(actorId, rental) {
  if (String(rental.ownerId) !== String(actorId)) {
    throw ApiError.forbidden('Only the equipment owner can accept a rental request.');
  }

  const preCheck = await rentalsRepository.findOverlappingAccepted(rental.equipmentId, rental.startDate, rental.endDate, rental._id);
  if (preCheck) {
    throw ApiError.conflict('This equipment was already booked for an overlapping date range.');
  }

  const updated = await rentalsRepository.transition(rental._id, ['requested'], 'accepted', {
    respondedBy: actorId,
    respondedAt: new Date(),
  });
  if (!updated) {
    throw ApiError.conflict('This request is no longer pending (it may have already been accepted, rejected, or cancelled).');
  }

  // Post-write re-check (see file header) — catches the narrow race
  // between two different requests for overlapping dates both being
  // accepted concurrently.
  const postCheck = await rentalsRepository.findOverlappingAccepted(rental.equipmentId, rental.startDate, rental.endDate, rental._id);
  if (postCheck) {
    await rentalsRepository.rollbackToRequested(rental._id);
    metrics.increment('rental_double_booking_prevented_total');
    logger.warn({ rentalId: String(rental._id), conflictingId: String(postCheck._id) }, 'rental_double_booking_prevented');
    throw ApiError.conflict('This equipment was just booked for an overlapping date range by another request. Please try a different window.');
  }

  metrics.increment('rental_accepted_total');
  logger.info({ rentalId: String(rental._id) }, 'rental_accepted');
  await notificationsService.notify({
    userId: rental.requesterId,
    type: 'rental_accepted',
    data: { rentalId: String(rental._id) },
  });
  return rentalsRepository.findByIdPlain(rental._id);
}

async function rejectRental(actorId, rental, { responseNote }) {
  if (String(rental.ownerId) !== String(actorId)) {
    throw ApiError.forbidden('Only the equipment owner can reject a rental request.');
  }
  const updated = await rentalsRepository.transition(rental._id, ['requested'], 'rejected', {
    respondedBy: actorId,
    respondedAt: new Date(),
    responseNote,
  });
  if (!updated) {
    throw ApiError.conflict('This request is no longer pending.');
  }
  metrics.increment('rental_rejected_total');
  logger.info({ rentalId: String(rental._id) }, 'rental_rejected');
  await notificationsService.notify({
    userId: rental.requesterId,
    type: 'rental_rejected',
    data: { rentalId: String(rental._id) },
  });
  return updated;
}

async function cancelRental(actorId, rental) {
  const isOwner = String(rental.ownerId) === String(actorId);
  const isRequester = String(rental.requesterId) === String(actorId);
  if (!isOwner && !isRequester) {
    throw ApiError.forbidden('You are not a participant in this rental request.');
  }

  const updated = await rentalsRepository.transition(rental._id, ['requested', 'accepted'], 'cancelled', {
    cancelledBy: actorId,
    cancelledAt: new Date(),
  });
  if (!updated) {
    throw ApiError.conflict('This request can no longer be cancelled (it is already completed, rejected, or cancelled).');
  }
  metrics.increment('rental_cancelled_total');
  logger.info({ rentalId: String(rental._id), actorId }, 'rental_cancelled');
  const notifyUserId = isOwner ? rental.requesterId : rental.ownerId;
  await notificationsService.notify({
    userId: notifyUserId,
    type: 'rental_cancelled',
    data: { rentalId: String(rental._id) },
  });
  return updated;
}

/** Only the owner marks a rental completed — they are the party who
 * physically has the equipment back, the same "authoritative party"
 * reasoning as the IoT layer's device-confirmed state. */
async function completeRental(actorId, rental) {
  if (String(rental.ownerId) !== String(actorId)) {
    throw ApiError.forbidden('Only the equipment owner can mark a rental as completed.');
  }
  const updated = await rentalsRepository.transition(rental._id, ['accepted'], 'completed', {
    completedAt: new Date(),
  });
  if (!updated) {
    throw ApiError.conflict('Only an accepted rental can be marked as completed.');
  }
  metrics.increment('rental_completed_total');
  logger.info({ rentalId: String(rental._id) }, 'rental_completed');
  await notificationsService.notify({
    userId: rental.requesterId,
    type: 'rental_completed',
    data: { rentalId: String(rental._id) },
  });
  return updated;
}

async function listMine(userId, query, roleFilter) {
  const { page, limit, skip } = resolvePagination(query);
  const opts = { status: query.status, skip, limit };
  const { items, total } =
    roleFilter === 'owner'
      ? await rentalsRepository.listForOwner(userId, opts)
      : await rentalsRepository.listForRequester(userId, opts);
  return paginatedResponse(items, total, { page, limit });
}

/**
 * Only the REQUESTER may review, and only once the rental is
 * COMPLETED (section 13: "review before completion" must be
 * prevented) — both checked here, in addition to the schema-level
 * unique-index guard inside reviews.service.js.
 */
async function reviewRental(reviewerId, rental, { rating, comment }) {
  if (String(rental.requesterId) !== String(reviewerId)) {
    throw ApiError.forbidden('Only the person who rented this equipment can review it.');
  }
  if (rental.status !== 'completed') {
    throw ApiError.badRequest('You can only review a rental after it has been completed.');
  }

  const review = await reviewsService.submitReview(
    {
      reviewerId,
      revieweeId: rental.ownerId,
      transactionType: 'rental',
      transactionId: rental._id,
      targetType: 'equipment',
      targetId: rental.equipmentId,
      rating,
      comment,
    },
    async (aggregate) => {
      await equipmentRepository.applyRatingDelta(rental.equipmentId, {
        newAverage: aggregate.average,
        newCount: aggregate.count,
      });
    }
  );
  await rentalsRepository.setStatus(rental._id, rental.status, { reviewedByRequester: true });
  metrics.increment('review_created_total_rental');
  return review;
}

module.exports = {
  requestRental,
  acceptRental,
  rejectRental,
  cancelRental,
  completeRental,
  reviewRental,
  listMine,
};
