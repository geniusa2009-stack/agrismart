'use strict';

const followsRepository = require('./follows.repository');
const profilesRepository = require('./profiles.repository');
const usersRepository = require('../users/users.repository');
const notificationsService = require('../notifications/notifications.service');
const { ApiError } = require('../../middleware/errorHandler');
const metrics = require('../../observability/metrics');

/**
 * `followerId` is ALWAYS req.user.id from the authenticated principal
 * — never a client-supplied value (section 10: "never trust userId
 * from request body"). `targetUserId` comes from the URL param.
 */
async function follow(followerId, targetUserId) {
  if (String(followerId) === String(targetUserId)) {
    throw ApiError.badRequest('You cannot follow yourself.');
  }

  const targetUser = await usersRepository.findById(targetUserId);
  if (!targetUser || !targetUser.isActive) {
    throw ApiError.notFound('User not found.');
  }

  const existing = await followsRepository.findEdge(followerId, targetUserId);
  if (existing) {
    return existing; // idempotent — following twice is a no-op, not an error
  }

  try {
    const edge = await followsRepository.create(followerId, targetUserId);
    await Promise.all([
      profilesRepository.incrementCounters(followerId, { followingCount: 1 }),
      profilesRepository.incrementCounters(targetUserId, { followerCount: 1 }),
    ]);
    metrics.increment('follow_created_total');
    await notificationsService.notify({
      userId: targetUserId,
      type: 'new_follower',
      data: { followerId },
    });
    return edge;
  } catch (err) {
    // Unique index race: two concurrent follow clicks from the same
    // user — treat as success (idempotent), not an error.
    if (err && err.code === 11000) {
      return followsRepository.findEdge(followerId, targetUserId);
    }
    throw err;
  }
}

async function unfollow(followerId, targetUserId) {
  const removed = await followsRepository.remove(followerId, targetUserId);
  if (removed) {
    await Promise.all([
      profilesRepository.incrementCounters(followerId, { followingCount: -1 }),
      profilesRepository.incrementCounters(targetUserId, { followerCount: -1 }),
    ]);
  }
}

async function isFollowing(followerId, targetUserId) {
  const edge = await followsRepository.findEdge(followerId, targetUserId);
  return Boolean(edge);
}

module.exports = { follow, unfollow, isFollowing };
