'use strict';

const commentsRepository = require('./comments.repository');
const postsRepository = require('./posts.repository');
const notificationsService = require('../notifications/notifications.service');
const { resolvePagination, paginatedResponse } = require('../../utils/pagination');
const metrics = require('../../observability/metrics');

/**
 * `post` is the already-loaded, visibility-checked post (req.post,
 * attached by posts.controller.loadVisiblePost) — commenting on a
 * hidden/removed/nonexistent post is impossible by construction, not
 * just by convention.
 */
async function createComment(post, authorId, body) {
  const comment = await commentsRepository.create({ postId: post._id, authorId, body });
  await postsRepository.incrementCommentCount(post._id, 1);
  metrics.increment('comment_created_total');

  if (String(post.authorId) !== String(authorId)) {
    await notificationsService.notify({
      userId: post.authorId,
      type: 'new_comment',
      data: { postId: String(post._id), commentId: String(comment._id), actorId: authorId },
    });
  }
  return comment;
}

async function listForPost(postId, query) {
  const { page, limit, skip } = resolvePagination(query);
  const { items, total } = await commentsRepository.listForPost(postId, { skip, limit });
  return paginatedResponse(items, total, { page, limit });
}

async function updateComment(comment, body) {
  return commentsRepository.updateById(comment._id, { body, editedAt: new Date() });
}

async function deleteComment(comment) {
  await commentsRepository.updateById(comment._id, { moderationStatus: 'removed', deletedAt: new Date() });
  await postsRepository.incrementCommentCount(comment.postId, -1);
}

async function moderateComment(comment, status) {
  const patch = { moderationStatus: status };
  if (status === 'removed') patch.deletedAt = new Date();
  return commentsRepository.updateById(comment._id, patch);
}

module.exports = { createComment, listForPost, updateComment, deleteComment, moderateComment };
