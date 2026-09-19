'use strict';

const Review = require('./review.model');

async function create(payload) {
  return Review.create(payload);
}

async function listForTarget(targetType, targetId, { skip, limit }) {
  const query = { targetType, targetId };
  const [items, total] = await Promise.all([
    Review.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Review.countDocuments(query),
  ]);
  return { items, total };
}

/** Recomputes the aggregate for a target directly from the Review
 * collection (rather than incrementally maintaining a running average)
 * — simpler and self-correcting, and review volume per listing is low
 * enough that a full aggregation on write is cheap. */
async function computeAggregate(targetType, targetId) {
  const [result] = await Review.aggregate([
    { $match: { targetType, targetId } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  return result ? { average: Math.round(result.average * 10) / 10, count: result.count } : { average: 0, count: 0 };
}

module.exports = { create, listForTarget, computeAggregate };
