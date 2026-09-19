'use strict';

const UserProfile = require('./userProfile.model');

async function findByUserId(userId) {
  return UserProfile.findOne({ userId });
}

async function createDefault(userId) {
  return UserProfile.create({ userId });
}

async function updateByUserId(userId, updates) {
  return UserProfile.findOneAndUpdate({ userId }, { $set: updates }, { new: true });
}

/**
 * Upserts so a counter update never silently no-ops just because the
 * target user hasn't visited/edited their profile yet (a profile
 * document is created lazily — see createDefault — so without upsert
 * here, follower/post counts on a brand-new account would be wrong
 * until they happened to trigger profile creation themselves).
 */
async function incrementCounters(userId, deltas) {
  return UserProfile.findOneAndUpdate(
    { userId },
    { $inc: deltas },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function setVerificationStatus(userId, status) {
  return UserProfile.findOneAndUpdate({ userId }, { $set: { verificationStatus: status } }, { new: true });
}

module.exports = { findByUserId, createDefault, updateByUserId, incrementCounters, setVerificationStatus };
