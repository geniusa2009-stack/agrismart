'use strict';

/**
 * modules/community/userProfile.model.js
 *
 * Public agricultural profile, deliberately SEPARATE from user.model.js
 * (Overnight Community task, section 4: "Separate public profile data
 * from private account data"). This document is what other farmers see
 * on a profile page and in feed bylines — it never holds email,
 * passwordHash, role, or anything from the private account record.
 * One profile per user (unique index on userId); created lazily on
 * first access/edit rather than at registration time, so the base IoT
 * onboarding flow is untouched.
 */

const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },

    displayName: { type: String, trim: true, maxlength: 80 },
    bio: { type: String, trim: true, maxlength: 500 },
    // Reference only (e.g. a future object-storage URL/key) — no upload
    // infrastructure exists yet, so this is never populated by an
    // upload endpoint today; see the attachment abstraction note in
    // post.model.js for the same reasoning.
    avatarUrl: { type: String, trim: true, maxlength: 500 },

    governorate: { type: String, trim: true, maxlength: 60, index: true },
    city: { type: String, trim: true, maxlength: 60 },

    crops: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] },
    interests: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] },
    experienceYears: { type: Number, min: 0, max: 100 },

    // Never settable by the profile owner — only a moderator/admin
    // action (moderation.service.js) can move this. See
    // profiles.validators.js: 'verificationStatus' is deliberately
    // absent from the self-service update schema.
    verificationStatus: {
      type: String,
      enum: ['unverified', 'pending', 'verified'],
      default: 'unverified',
      index: true,
    },

    // Denormalized counters, maintained exclusively by
    // follows.service.js / posts.service.js via atomic $inc — never
    // written directly from a client request (Overnight Community
    // task, section 26: never present a fake trust/engagement number).
    followerCount: { type: Number, default: 0, min: 0 },
    followingCount: { type: Number, default: 0, min: 0 },
    postCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserProfile', userProfileSchema);
