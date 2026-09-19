'use strict';

/**
 * modules/marketplace/savedItem.model.js
 *
 * Generic "bookmark" shared across equipment/services/marketplace
 * (task brief's "SavedItem" future-ready model, section 2) — one model
 * rather than three separate saved-equipment/saved-service/saved-
 * listing collections, since the shape is identical regardless of
 * target type. Lives in the marketplace module because that's where
 * "Saved" first appears as a nav item (section 16), but is intentionally
 * generic (`targetType`) so equipment/services reuse it too.
 */

const mongoose = require('mongoose');

const SAVED_ITEM_TARGET_TYPES = ['equipment', 'service', 'marketplace_listing', 'post'];

const savedItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: SAVED_ITEM_TARGET_TYPES, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

savedItemSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });
savedItemSchema.index({ userId: 1, targetType: 1, createdAt: -1 });

module.exports = mongoose.model('SavedItem', savedItemSchema);
module.exports.SAVED_ITEM_TARGET_TYPES = SAVED_ITEM_TARGET_TYPES;
