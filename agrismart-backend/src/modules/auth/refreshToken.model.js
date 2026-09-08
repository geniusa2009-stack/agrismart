'use strict';

/**
 * modules/auth/refreshToken.model.js
 *
 * Refresh tokens are opaque random values; only their HASH is stored
 * here (Stage 2 section 6). `familyId` links every token descended from
 * one original login — on rotation a new document is created in the
 * same family and the old one is marked `rotatedAt`; if an already-
 * rotated token is ever presented again, that's reuse-detection
 * evidence and the WHOLE family is revoked (see auth.service.js).
 */

const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    userAgent: { type: String },
    revokedAt: { type: Date, default: null },
    rotatedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
