'use strict';

const RefreshToken = require('./refreshToken.model');

async function createRefreshToken({ userId, tokenHash, familyId, userAgent, expiresAt }) {
  return RefreshToken.create({ userId, tokenHash, familyId, userAgent, expiresAt });
}

async function findByTokenHash(tokenHash) {
  return RefreshToken.findOne({ tokenHash });
}

async function markRotated(id) {
  return RefreshToken.findByIdAndUpdate(id, { rotatedAt: new Date() });
}

async function revokeFamily(familyId) {
  return RefreshToken.updateMany({ familyId, revokedAt: null }, { revokedAt: new Date() });
}

async function revokeAllForUser(userId) {
  return RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
}

module.exports = {
  createRefreshToken,
  findByTokenHash,
  markRotated,
  revokeFamily,
  revokeAllForUser,
};
