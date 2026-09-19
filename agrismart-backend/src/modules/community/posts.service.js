'use strict';

const postsRepository = require('./posts.repository');
const profilesRepository = require('../community/profiles.repository');
const { resolvePagination, paginatedResponse } = require('../../utils/pagination');
const { ApiError } = require('../../middleware/errorHandler');
const metrics = require('../../observability/metrics');
const logger = require('../../observability/logger');

async function createPost(authorId, { category, body, attachments, location }) {
  const post = await postsRepository.create({ authorId, category, body, attachments, location });
  await profilesRepository.incrementCounters(authorId, { postCount: 1 });
  metrics.increment('post_created_total');
  logger.info({ authorId, postId: String(post._id), category }, 'post_created');
  return post;
}

async function getFeed(query) {
  const { page, limit, skip } = resolvePagination(query);
  const { items, total } = await postsRepository.listFeed({
    category: query.category,
    governorate: query.governorate,
    authorId: query.authorId,
    skip,
    limit,
  });
  return paginatedResponse(items, total, { page, limit });
}

async function getPostById(postId) {
  const post = await postsRepository.findVisibleById(postId);
  if (!post) {
    throw ApiError.notFound('Post not found.');
  }
  return post;
}

/**
 * `post` is the already ownership-checked document attached by
 * authorizeResourceOwnership (req.post) — same convention as
 * farms.service.updateFarm. Never re-derives ownership here.
 */
async function updatePost(post, updates) {
  const patch = { ...updates, editedAt: new Date() };
  return postsRepository.updateById(post._id, patch);
}

async function deletePost(post) {
  await postsRepository.updateById(post._id, { moderationStatus: 'removed', deletedAt: new Date() });
  await profilesRepository.incrementCounters(post.authorId, { postCount: -1 });
}

/** Staff-only moderation action — see posts.routes.js's authorizeRole
 * gate on this specific route; a plain owner can only ever reach
 * `deletePost` above (soft-delete their own post), never this. */
async function moderatePost(post, status) {
  const patch = { moderationStatus: status };
  if (status === 'removed') patch.deletedAt = new Date();
  metrics.increment('moderation_action_total');
  logger.info({ postId: String(post._id), status }, 'moderation_action');
  return postsRepository.updateById(post._id, patch);
}

module.exports = { createPost, getFeed, getPostById, updatePost, deletePost, moderatePost };
