'use strict';

/**
 * modules/trust/review.model.js
 *
 * A review is always anchored to one specific, already-COMPLETED
 * transaction (a rental request or a service request) — never a
 * free-floating "review this user" action (section 13/26: reviews must
 * only be allowed where the underlying transaction actually qualifies,
 * and must never let an arbitrary user manufacture reputation). The
 * unique compound index on (transactionType, transactionId,
 * reviewerId) is the actual duplicate-review guard, not just
 * application logic — see reviews.service.js.
 */

const mongoose = require('mongoose');

const TRANSACTION_TYPES = ['rental', 'service_request'];
const TARGET_TYPES = ['equipment', 'service'];

const reviewSchema = new mongoose.Schema(
  {
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    revieweeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    transactionType: { type: String, enum: TRANSACTION_TYPES, required: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, required: true },

    targetType: { type: String, enum: TARGET_TYPES, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

reviewSchema.index({ transactionType: 1, transactionId: 1, reviewerId: 1 }, { unique: true });
reviewSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
reviewSchema.index({ revieweeId: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
module.exports.TRANSACTION_TYPES = TRANSACTION_TYPES;
module.exports.TARGET_TYPES = TARGET_TYPES;
