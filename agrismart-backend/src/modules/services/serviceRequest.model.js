'use strict';

/**
 * modules/services/serviceRequest.model.js
 *
 * Lifecycle per the task brief section 7:
 *   REQUESTED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
 *                                        \-> CANCELLED
 *   REQUESTED|ACCEPTED -> CANCELLED
 * Enforced by services.service.js's explicit transition table, same
 * pattern as commands.service.js's `transition()` in the IoT layer.
 */

const mongoose = require('mongoose');

// 'rejected' is an addition beyond the brief's diagrammed states
// (REQUESTED -> ACCEPTED -> IN_PROGRESS -> COMPLETED or CANCELLED) —
// added for parity with the equipment-rental lifecycle and because
// "the provider declined" is a materially different, useful-to-
// distinguish outcome from "either party cancelled after acceptance".
const SERVICE_REQUEST_STATUSES = ['requested', 'accepted', 'in_progress', 'completed', 'rejected', 'cancelled'];

const serviceRequestSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgriculturalService', required: true, index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    preferredDate: { type: Date },
    pricingUnit: { type: String, enum: ['hour', 'day', 'job'], required: true },
    priceQuoted: { type: Number, required: true, min: 0 },
    message: { type: String, trim: true, maxlength: 1000 },

    status: { type: String, enum: SERVICE_REQUEST_STATUSES, default: 'requested', index: true },

    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    respondedAt: { type: Date },
    responseNote: { type: String, trim: true, maxlength: 500 },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },

    // Mirrors rentalRequest.model.js's identical field — lets the
    // frontend truthfully disable "leave a review" after one has
    // already been submitted, without re-deriving it from the Review
    // collection on every list render. The actual duplicate-review
    // guard is still the unique index in trust/review.model.js
    // (reviewsService.submitReview) — this flag is a read convenience,
    // never the source of truth for whether a second review is
    // rejected.
    reviewedByRequester: { type: Boolean, default: false },
  },
  { timestamps: true }
);

serviceRequestSchema.index({ requesterId: 1, createdAt: -1 });
serviceRequestSchema.index({ providerId: 1, createdAt: -1 });
serviceRequestSchema.index({ providerId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('ServiceRequest', serviceRequestSchema);
module.exports.SERVICE_REQUEST_STATUSES = SERVICE_REQUEST_STATUSES;
