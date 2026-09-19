'use strict';

/**
 * modules/community/reaction.model.js
 *
 * One reaction per (user, target) — the unique compound index is the
 * actual duplicate-reaction guard (not just application logic), so a
 * race between two concurrent "like" clicks from the same user cannot
 * create two documents (Overnight Community task, section 22).
 * Toggling a reaction off is a delete, not a status flag — there is no
 * meaningful "un-liked" state to keep around.
 */

const mongoose = require('mongoose');

const REACTION_TARGET_TYPES = ['post', 'comment'];
const REACTION_TYPES = ['like', 'helpful', 'celebrate'];

const reactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: REACTION_TARGET_TYPES, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: REACTION_TYPES, default: 'like' },
  },
  { timestamps: true }
);

reactionSchema.index({ targetType: 1, targetId: 1, userId: 1 }, { unique: true });
reactionSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model('Reaction', reactionSchema);
module.exports.REACTION_TARGET_TYPES = REACTION_TARGET_TYPES;
module.exports.REACTION_TYPES = REACTION_TYPES;
