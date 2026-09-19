'use strict';

/**
 * modules/marketplace/marketplaceListing.model.js
 *
 * `category` is a fixed enum rather than a separate `Category`
 * collection (task brief mentions "Category" as a potential model) —
 * there is no admin UI to manage a dynamic taxonomy yet, and a fixed,
 * well-chosen enum is simpler, indexable, and avoids the "do not
 * over-engineer" trap of building CRUD for a concept with a handful of
 * known values. Revisit as a real collection only if/when category
 * management genuinely needs to be dynamic (e.g. per-region categories).
 *
 * No checkout/payment fields exist anywhere on this schema — per the
 * task brief section 8, this MVP supports discovery, seller contact,
 * saving, and reporting only.
 */

const mongoose = require('mongoose');

const LISTING_CATEGORIES = ['seeds', 'fertilizers', 'irrigation_supplies', 'equipment', 'tools', 'products', 'other'];

const photoSchema = new mongoose.Schema(
  { url: { type: String, required: true, trim: true, maxlength: 1000 }, caption: { type: String, trim: true, maxlength: 200 } },
  { _id: false }
);

const marketplaceListingSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    category: { type: String, enum: LISTING_CATEGORIES, required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 3000 },

    price: { type: Number, required: true, min: 0, max: 100_000_000 },
    unit: { type: String, required: true, trim: true, maxlength: 30 }, // e.g. "kg", "ton", "piece", "liter"

    location: {
      governorate: { type: String, trim: true, maxlength: 60, index: true },
      city: { type: String, trim: true, maxlength: 60 },
    },

    availability: { type: String, enum: ['in_stock', 'out_of_stock'], default: 'in_stock' },
    photos: { type: [photoSchema], default: [] },

    status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active', index: true },
    moderationStatus: { type: String, enum: ['visible', 'hidden', 'removed'], default: 'visible', index: true },
  },
  { timestamps: true }
);

marketplaceListingSchema.index({ status: 1, moderationStatus: 1, category: 1, createdAt: -1 });
marketplaceListingSchema.index({ status: 1, moderationStatus: 1, 'location.governorate': 1, createdAt: -1 });
marketplaceListingSchema.index({ status: 1, moderationStatus: 1, price: 1 });
marketplaceListingSchema.index({ sellerId: 1, createdAt: -1 });

module.exports = mongoose.model('MarketplaceListing', marketplaceListingSchema);
module.exports.LISTING_CATEGORIES = LISTING_CATEGORIES;
