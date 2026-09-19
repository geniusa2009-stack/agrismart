'use strict';

/**
 * modules/community/reactions.service.js
 *
 * Wired for posts only in this pass (matches the API surface in the
 * task brief's section 19 example: `POST /community/posts/:id/reactions`).
 * reactions.repository.js itself is generic over targetType so
 * comment-level reactions can be added later without a schema change —
 * only this service + a route would need to grow.
 */

const reactionsRepository = require('./reactions.repository');
const postsRepository = require('./posts.repository');
const notificationsService = require('../notifications/notifications.service');
const metrics = require('../../observability/metrics');

/**
 * Toggle semantics: reacting again with the SAME type removes the
 * reaction (un-react); reacting with a DIFFERENT type replaces it.
 * Prevented from creating duplicates by the unique compound index on
 * (targetType, targetId, userId) even under a race — the `try/catch`
 * on 11000 below is the safety net for that race, not the primary
 * guard.
 */
async function toggleReactionOnPost(userId, post, type) {
  const existing = await reactionsRepository.findOne(userId, 'post', post._id);

  if (existing && existing.type === type) {
    await reactionsRepository.remove(userId, 'post', post._id);
    await postsRepository.incrementReactionCount(post._id, -1);
    return { reacted: false };
  }

  if (existing) {
    await reactionsRepository.remove(userId, 'post', post._id);
    await reactionsRepository.create({ userId, targetType: 'post', targetId: post._id, type });
    return { reacted: true, type };
  }

  try {
    await reactionsRepository.create({ userId, targetType: 'post', targetId: post._id, type });
    await postsRepository.incrementReactionCount(post._id, 1);
    metrics.increment('reaction_created_total');
    if (String(post.authorId) !== String(userId)) {
      await notificationsService.notify({
        userId: post.authorId,
        type: 'new_reaction',
        data: { postId: String(post._id), actorId: userId, reactionType: type },
      });
    }
    return { reacted: true, type };
  } catch (err) {
    if (err && err.code === 11000) {
      // Lost the create race — someone else's reaction snuck in first;
      // treat as already-reacted, not an error.
      return { reacted: true, type };
    }
    throw err;
  }
}

module.exports = { toggleReactionOnPost };
