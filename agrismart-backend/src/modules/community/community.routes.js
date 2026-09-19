'use strict';

/**
 * modules/community/community.routes.js
 *
 * Mounted at /api/v1/community (routes/index.js). Aggregates
 * posts/comments/reactions/follows/profiles under one router rather
 * than five separate top-level mounts — they share one moderation
 * story and one rate-limit tier structure, so keeping them under a
 * single namespace matches the product's own IA (section 16: "المجتمع").
 *
 * Every ownership boundary here follows the exact pattern already used
 * by farms/irrigation: `authorizeResourceOwnership` folds "does this
 * resource belong to me (or am I staff)?" into a single reusable
 * middleware, attaching the loaded document to `req` so services never
 * re-derive access — see middleware/authorizeResourceOwnership.js.
 */

const express = require('express');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const authorizeRole = require('../../middleware/authorizeRole');
const { authorizeResourceOwnership } = require('../../middleware/authorizeResourceOwnership');
const { ROLES } = require('../../security/rbac');
const { communityWriteLimiter, communityEngagementLimiter } = require('../../middleware/rateLimiter');

const postsController = require('./posts.controller');
const postsRepository = require('./posts.repository');
const {
  createPostSchema,
  updatePostSchema,
  moderatePostSchema,
  postIdParamsSchema,
  feedQuerySchema,
} = require('./posts.validators');

const commentsController = require('./comments.controller');
const commentsRepository = require('./comments.repository');
const {
  createCommentSchema,
  updateCommentSchema,
  moderateCommentSchema,
  commentIdParamsSchema,
  listQuerySchema: commentsListQuerySchema,
} = require('./comments.validators');

const reactionsController = require('./reactions.controller');
const { toggleReactionSchema } = require('./reactions.validators');

const profilesController = require('./profiles.controller');
const { updateProfileSchema, userIdParamsSchema } = require('./profiles.validators');

const followsController = require('./follows.controller');

const router = express.Router();

router.use(authenticate);

// ---- Posts ----------------------------------------------------------
router.post('/posts', communityWriteLimiter, validate(createPostSchema), postsController.create);
router.get('/posts', validate(feedQuerySchema, 'query'), postsController.getFeed);
router.get('/posts/:postId', validate(postIdParamsSchema, 'params'), postsController.getById);
router.patch(
  '/posts/:postId',
  communityWriteLimiter,
  validate(postIdParamsSchema, 'params'),
  authorizeResourceOwnership({
    paramName: 'postId',
    fetchById: postsRepository.findByIdPlain,
    ownerField: 'authorId',
    attachAs: 'post',
    notFoundMessage: 'Post not found.',
  }),
  validate(updatePostSchema),
  postsController.update
);
router.delete(
  '/posts/:postId',
  communityWriteLimiter,
  validate(postIdParamsSchema, 'params'),
  authorizeResourceOwnership({
    paramName: 'postId',
    fetchById: postsRepository.findByIdPlain,
    ownerField: 'authorId',
    attachAs: 'post',
    notFoundMessage: 'Post not found.',
  }),
  postsController.remove
);
router.patch(
  '/posts/:postId/moderate',
  communityWriteLimiter,
  authorizeRole(ROLES.MODERATOR, ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(postIdParamsSchema, 'params'),
  authorizeResourceOwnership({
    paramName: 'postId',
    fetchById: postsRepository.findByIdPlain,
    ownerField: 'authorId',
    attachAs: 'post',
    allowStaff: true,
    notFoundMessage: 'Post not found.',
  }),
  validate(moderatePostSchema),
  postsController.moderate
);

// ---- Comments (nested for create/list, flat for edit/delete) --------
router.post(
  '/posts/:postId/comments',
  communityEngagementLimiter,
  validate(postIdParamsSchema, 'params'),
  postsController.loadVisiblePost,
  validate(createCommentSchema),
  commentsController.create
);
router.get(
  '/posts/:postId/comments',
  validate(postIdParamsSchema, 'params'),
  validate(commentsListQuerySchema, 'query'),
  postsController.loadVisiblePost,
  commentsController.list
);
router.patch(
  '/comments/:commentId',
  communityEngagementLimiter,
  validate(commentIdParamsSchema, 'params'),
  authorizeResourceOwnership({
    paramName: 'commentId',
    fetchById: commentsRepository.findByIdPlain,
    ownerField: 'authorId',
    attachAs: 'comment',
    notFoundMessage: 'Comment not found.',
  }),
  validate(updateCommentSchema),
  commentsController.update
);
router.delete(
  '/comments/:commentId',
  communityEngagementLimiter,
  validate(commentIdParamsSchema, 'params'),
  authorizeResourceOwnership({
    paramName: 'commentId',
    fetchById: commentsRepository.findByIdPlain,
    ownerField: 'authorId',
    attachAs: 'comment',
    notFoundMessage: 'Comment not found.',
  }),
  commentsController.remove
);
router.patch(
  '/comments/:commentId/moderate',
  communityWriteLimiter,
  authorizeRole(ROLES.MODERATOR, ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(commentIdParamsSchema, 'params'),
  authorizeResourceOwnership({
    paramName: 'commentId',
    fetchById: commentsRepository.findByIdPlain,
    ownerField: 'authorId',
    attachAs: 'comment',
    allowStaff: true,
    notFoundMessage: 'Comment not found.',
  }),
  validate(moderateCommentSchema),
  commentsController.moderate
);

// ---- Reactions --------------------------------------------------------
router.post(
  '/posts/:postId/reactions',
  communityEngagementLimiter,
  validate(postIdParamsSchema, 'params'),
  postsController.loadVisiblePost,
  validate(toggleReactionSchema),
  reactionsController.toggle
);

// ---- Profiles -----------------------------------------------------
router.get('/profile/me', profilesController.getMyProfile);
router.patch('/profile/me', communityWriteLimiter, validate(updateProfileSchema), profilesController.updateMyProfile);
router.get('/profiles/:userId', validate(userIdParamsSchema, 'params'), profilesController.getProfileByUserId);

// ---- Follows --------------------------------------------------------
router.post(
  '/follows/:userId',
  communityEngagementLimiter,
  validate(userIdParamsSchema, 'params'),
  followsController.follow
);
router.delete(
  '/follows/:userId',
  communityEngagementLimiter,
  validate(userIdParamsSchema, 'params'),
  followsController.unfollow
);

module.exports = router;
