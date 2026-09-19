'use strict';

/**
 * modules/equipment/equipment.model.js
 *
 * A rentable piece of agricultural equipment. `status` (owner-
 * controlled: active/paused/archived) is deliberately separate from
 * `moderationStatus` (staff-controlled: visible/hidden/removed) — same
 * split as post.model.js, so a moderator hiding a listing for review
 * doesn't destroy the owner's own pause/resume toggle, and vice versa.
 * `photos` is the same reference-only attachment abstraction as
 * post.model.js's `attachments` — no upload infrastructure exists yet.
 */

const mongoose = require('mongoose');

const EQUIPMENT_TYPES = [
  'tractor',
  'harvester',
  'sprayer',
  'cultivator',
  'irrigation_equipment',
  'other',
];

const PRICING_UNITS = ['hour', 'day', 'job'];
const CONDITIONS = ['new', 'excellent', 'good', 'fair'];

const photoSchema = new mongoose.Schema(
  { url: { type: String, required: true, trim: true, maxlength: 1000 }, caption: { type: String, trim: true, maxlength: 200 } },
  { _id: false }
);

const equipmentSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    equipmentType: { type: String, enum: EQUIPMENT_TYPES, required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 3000 },

    location: {
      governorate: { type: String, trim: true, maxlength: 60, index: true },
      city: { type: String, trim: true, maxlength: 60 },
    },
    // Advertised service radius in km — an owner-claimed figure, not a
    // computed one (no geolocation infrastructure exists yet; see
    // section 18 — never claim accurate distance from this alone).
    serviceRadiusKm: { type: Number, min: 0, max: 500 },

    pricing: {
      unit: { type: String, enum: PRICING_UNITS, required: true },
      amount: { type: Number, required: true, min: 1, max: 10_000_000 },
    },

    condition: { type: String, enum: CONDITIONS, default: 'good' },
    operatorAvailable: { type: Boolean, default: false },
    photos: { type: [photoSchema], default: [] },

    // Owner-controlled lifecycle: active = listed/rentable, paused =
    // temporarily hidden from discovery by the owner's own choice,
    // archived = owner is done with this listing (soft-delete).
    status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active', index: true },
    moderationStatus: { type: String, enum: ['visible', 'hidden', 'removed'], default: 'visible', index: true },

    // Trust system aggregate — maintained exclusively by
    // trust/review.service.js via atomic recompute, never client-
    // writable (section 13/26: never manufacture a trust score).
    ratingAverage: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

equipmentSchema.index({ status: 1, moderationStatus: 1, equipmentType: 1, createdAt: -1 });
equipmentSchema.index({ status: 1, moderationStatus: 1, 'location.governorate': 1, createdAt: -1 });
equipmentSchema.index({ status: 1, moderationStatus: 1, 'pricing.amount': 1 });
equipmentSchema.index({ ownerId: 1, createdAt: -1 });

module.exports = mongoose.model('Equipment', equipmentSchema);
module.exports.EQUIPMENT_TYPES = EQUIPMENT_TYPES;
module.exports.PRICING_UNITS = PRICING_UNITS;
module.exports.CONDITIONS = CONDITIONS;
