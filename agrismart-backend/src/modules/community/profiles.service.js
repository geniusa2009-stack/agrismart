'use strict';

const profilesRepository = require('./profiles.repository');
const usersRepository = require('../users/users.repository');
const followsService = require('./follows.service');
const { ApiError } = require('../../middleware/errorHandler');

/**
 * Public profile view — merges the lazily-created UserProfile document
 * with the handful of safe public fields from the User account
 * (fullName as a display-name fallback). NEVER includes email,
 * passwordHash, or role (section 4: keep public/private data
 * separate).
 */
async function getPublicProfile(targetUserId, viewer) {
  const user = await usersRepository.findById(targetUserId);
  if (!user || !user.isActive) {
    throw ApiError.notFound('Farmer not found.');
  }

  const profile = await profilesRepository.findByUserId(targetUserId);

  const viewerIsFollowing = viewer ? await followsService.isFollowing(viewer.id, targetUserId) : false;

  return {
    userId: String(user._id),
    displayName: (profile && profile.displayName) || user.fullName,
    bio: profile ? profile.bio : undefined,
    avatarUrl: profile ? profile.avatarUrl : undefined,
    governorate: profile ? profile.governorate : undefined,
    city: profile ? profile.city : undefined,
    crops: profile ? profile.crops : [],
    interests: profile ? profile.interests : [],
    experienceYears: profile ? profile.experienceYears : undefined,
    verificationStatus: profile ? profile.verificationStatus : 'unverified',
    followerCount: profile ? profile.followerCount : 0,
    followingCount: profile ? profile.followingCount : 0,
    postCount: profile ? profile.postCount : 0,
    isSelf: viewer ? String(viewer.id) === String(targetUserId) : false,
    isFollowing: viewerIsFollowing,
    memberSince: user.createdAt,
  };
}

/**
 * `userId` is always the authenticated principal — a farmer can only
 * ever edit their own profile via this function; there is no
 * `targetUserId` parameter, so it is structurally impossible to call
 * this with someone else's id from the update route.
 */
async function updateMyProfile(userId, updates) {
  const existing = await profilesRepository.findByUserId(userId);
  if (!existing) {
    await profilesRepository.createDefault(userId);
  }
  return profilesRepository.updateByUserId(userId, updates);
}

module.exports = { getPublicProfile, updateMyProfile };
