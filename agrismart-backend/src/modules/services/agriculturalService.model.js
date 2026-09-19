'use strict';

/**
 * modules/services/agriculturalService.model.js
 *
 * A service listing offered by a provider. Deliberately no separate
 * `ServiceProvider` collection (task brief section 1: "Do NOT blindly
 * create modules if equivalent existing architecture exists" / "Do not
 * over-engineer") — a provider's identity is just `providerId` (a
 * User), and their public-facing info is the same UserProfile already
 * built for the community layer (governorate, bio, verificationStatus,
 * etc.) rather than a redundant duplicate profile shape.
 */

const mongoose = require('mongoose');

const SERVICE_TYPES = [
  'agricultural_consultant',
  'tractor_operator',
  'irrigation_technician',
  'soil_testing',
  'spraying_service',
  'harvesting_service',
  'machinery_maintenance',
  'other',
];

const PRICING_UNITS = ['hour', 'day', 'job'];

const agriculturalServiceSchema = new mongoose.Schema(
  {
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    serviceType: { type: String, enum: SERVICE_TYPES, required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 3000 },

    location: {
      governorate: { type: String, trim: true, maxlength: 60, index: true },
      city: { type: String, trim: true, maxlength: 60 },
    },
    serviceRadiusKm: { type: Number, min: 0, max: 500 },

    pricing: {
      unit: { type: String, enum: PRICING_UNITS, required: true },
      amount: { type: Number, required: true, min: 1, max: 10_000_000 },
    },

    status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active', index: true },
    moderationStatus: { type: String, enum: ['visible', 'hidden', 'removed'], default: 'visible', index: true },

    ratingAverage: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

agriculturalServiceSchema.index({ status: 1, moderationStatus: 1, serviceType: 1, createdAt: -1 });
agriculturalServiceSchema.index({ status: 1, moderationStatus: 1, 'location.governorate': 1, createdAt: -1 });
agriculturalServiceSchema.index({ providerId: 1, createdAt: -1 });

module.exports = mongoose.model('AgriculturalService', agriculturalServiceSchema);
module.exports.SERVICE_TYPES = SERVICE_TYPES;
module.exports.PRICING_UNITS = PRICING_UNITS;
