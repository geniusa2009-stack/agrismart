'use strict';

/**
 * modules/community/follow.model.js
 *
 * `followerId` follows `followingId`. Self-follow is rejected at the
 * service layer (follows.service.js), not the schema, so the error is
 * a clean ApiError.badRequest rather than a raw validator exception.
 * Unique compound index prevents duplicate follow edges under
 * concurrent requests (same race-safety reasoning as reaction.model.js).
 */

const mongoose = require('mongoose');

const followSchema = new mongoose.Schema(
  {
    followerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    followingId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

followSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
followSchema.index({ followingId: 1, createdAt: -1 });

module.exports = mongoose.model('Follow', followSchema);
