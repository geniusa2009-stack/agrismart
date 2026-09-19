'use strict';

/**
 * modules/equipment/rentalRequest.model.js
 *
 * `ownerId` is deliberately DENORMALIZED from the equipment listing at
 * request-creation time (not just derivable via a join) — two reasons:
 *   1) it lets "my rentals as an owner" list queries filter directly on
 *      RentalRequest without a lookup into Equipment for every row;
 *   2) it is immutable audit information (section 23: "who was
 *      responsible at the time"), correct even if equipment ownership
 *      were ever transferred later.
 * `priceQuoted`/`pricingUnit` are likewise a SNAPSHOT of the listing's
 * price at request time, not a live reference — so a later price
 * change on the listing can't retroactively alter an existing
 * request's terms.
 */

const mongoose = require('mongoose');

const RENTAL_STATUSES = ['requested', 'accepted', 'rejected', 'cancelled', 'completed'];

const rentalRequestSchema = new mongoose.Schema(
  {
    equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment', required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    pricingUnit: { type: String, enum: ['hour', 'day', 'job'], required: true },
    priceQuoted: { type: Number, required: true, min: 0 },

    message: { type: String, trim: true, maxlength: 1000 },

    status: { type: String, enum: RENTAL_STATUSES, default: 'requested', index: true },

    // Audit trail (section 23) for the state-changing actions.
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    respondedAt: { type: Date },
    responseNote: { type: String, trim: true, maxlength: 500 },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    completedAt: { type: Date },

    reviewedByRequester: { type: Boolean, default: false },
  },
  { timestamps: true }
);

rentalRequestSchema.index({ equipmentId: 1, status: 1, startDate: 1, endDate: 1 });
rentalRequestSchema.index({ requesterId: 1, createdAt: -1 });
rentalRequestSchema.index({ ownerId: 1, createdAt: -1 });
rentalRequestSchema.index({ ownerId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('RentalRequest', rentalRequestSchema);
module.exports.RENTAL_STATUSES = RENTAL_STATUSES;
