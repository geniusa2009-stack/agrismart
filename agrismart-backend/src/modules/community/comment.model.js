'use strict';

/**
 * modules/community/comment.model.js
 *
 * Single-level comments only (no nested reply threading) — deliberate
 * scope decision per the task brief's "do not over-engineer unnecessary
 * features"; a flat comment list under a post is enough for this
 * foundation pass and avoids the recursive-fetch/render complexity of
 * threaded replies.
 */

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    body: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },

    moderationStatus: { type: String, enum: ['visible', 'hidden', 'removed'], default: 'visible', index: true },
    editedAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

commentSchema.index({ postId: 1, moderationStatus: 1, createdAt: 1 });
commentSchema.index({ authorId: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
