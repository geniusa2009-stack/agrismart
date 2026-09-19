'use strict';

/**
 * modules/trust/reviews.service.js
 *
 * Deliberately does NOT know about rentals/services internals —
 * `submitReview()` trusts its caller (rentals.service.js /
 * services.service.js) to have already verified: the transaction is
 * actually COMPLETED, the reviewer is a legitimate participant, and
 * `revieweeId`/`targetType`/`targetId` are derived from the trusted
 * transaction record, never from client input. This keeps the trust
 * module's domain boundary clean (section 1: "keep domain boundaries
 * clean") while still enforcing every rule from section 13 (no
 * self-review, no duplicate review, no review before completion) via
 * the schema-level unique index below rather than trusting callers
 * alone (defense in depth).
 */

const reviewsRepository = require('./reviews.repository');
const { resolvePagination, paginatedResponse } = require('../../utils/pagination');
const { ApiError } = require('../../middleware/errorHandler');
const metrics = require('../../observability/metrics');

/**
 * @param {object} params
 * @param {string} params.reviewerId - already-verified participant (never client-supplied)
 * @param {string} params.revieweeId - the OTHER party, derived from the transaction record
 * @param {'rental'|'service_request'} params.transactionType
 * @param {string} params.transactionId
 * @param {'equipment'|'service'} params.targetType
 * @param {string} params.targetId
 * @param {number} params.rating
 * @param {string} [params.comment]
 * @param {(agg: { average: number, count: number }) => Promise<void>} onAggregateUpdated - applies the recomputed rating to the target document
 */
async function submitReview({ reviewerId, revieweeId, transactionType, transactionId, targetType, targetId, rating, comment }, onAggregateUpdated) {
  if (String(reviewerId) === String(revieweeId)) {
    // Should be structurally unreachable given how callers derive
    // revieweeId, but enforced here too — never allow a self-review.
    throw ApiError.badRequest('You cannot review yourself.');
  }

  try {
    const review = await reviewsRepository.create({
      reviewerId,
      revieweeId,
      transactionType,
      transactionId,
      targetType,
      targetId,
      rating,
      comment,
    });
    metrics.increment('review_created_total');

    const aggregate = await reviewsRepository.computeAggregate(targetType, targetId);
    if (onAggregateUpdated) {
      await onAggregateUpdated(aggregate);
    }
    return review;
  } catch (err) {
    if (err && err.code === 11000) {
      throw ApiError.conflict('You have already reviewed this transaction.');
    }
    throw err;
  }
}

async function listForTarget(targetType, targetId, query) {
  const { page, limit, skip } = resolvePagination(query);
  const { items, total } = await reviewsRepository.listForTarget(targetType, targetId, { skip, limit });
  return paginatedResponse(items, total, { page, limit });
}

module.exports = { submitReview, listForTarget };
