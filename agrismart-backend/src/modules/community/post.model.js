'use strict';

/**
 * modules/community/post.model.js
 *
 * A single community post. `attachments` is a clean, minimal
 * abstraction (Overnight Community task, section 3): it stores
 * references (url/caption/type) so the schema and API are shaped
 * correctly for media from day one, but NOTHING in this codebase
 * implements an upload endpoint yet — no upload infrastructure exists,
 * so inventing one here would violate "no fake functionality". Clients
 * may only attach a `url` they already control (e.g. pasted elsewhere);
 * this is not a photo-upload feature.
 */

const mongoose = require('mongoose');

const POST_CATEGORIES = [
  'question', // سؤال زراعي
  'advice', // نصيحة
  'experience', // تجربة
  'crop_problem', // مشكلة في المحصول
  'irrigation', // ري
  'soil', // تربة
  'equipment', // معدات
  'market_prices', // أسعار السوق
  'news', // أخبار زراعية
  'general', // عام
];

const attachmentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['image', 'video', 'document'], required: true },
    url: { type: String, required: true, trim: true, maxlength: 1000 },
    caption: { type: String, trim: true, maxlength: 200 },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, enum: POST_CATEGORIES, default: 'general', index: true },
    body: { type: String, required: true, trim: true, minlength: 1, maxlength: 5000 },
    attachments: { type: [attachmentSchema], default: [] },
    location: {
      governorate: { type: String, trim: true, maxlength: 60 },
    },

    commentCount: { type: Number, default: 0, min: 0 },
    reactionCount: { type: Number, default: 0, min: 0 },

    // Moderation state (section 12). 'visible' is the only state a
    // normal feed query returns — see posts.repository.js's default
    // filter. 'hidden' = a moderator action short of deletion;
    // 'removed' = soft-deleted (by the author or a moderator).
    moderationStatus: { type: String, enum: ['visible', 'hidden', 'removed'], default: 'visible', index: true },

    editedAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

postSchema.index({ moderationStatus: 1, createdAt: -1 });
postSchema.index({ authorId: 1, createdAt: -1 });
postSchema.index({ category: 1, moderationStatus: 1, createdAt: -1 });
postSchema.index({ 'location.governorate': 1, moderationStatus: 1, createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);
module.exports.POST_CATEGORIES = POST_CATEGORIES;
