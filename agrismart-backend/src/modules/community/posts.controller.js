'use strict';

const postsService = require('./posts.service');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const postsRepository = require('./posts.repository');

// `req.user.id` is the only possible authorId — never accepted from
// req.body (section 10).
const create = asyncHandler(async (req, res) => {
  const post = await postsService.createPost(req.user.id, req.body);
  res.status(201).json({ success: true, data: post });
});

const getFeed = asyncHandler(async (req, res) => {
  const result = await postsService.getFeed(req.query);
  res.status(200).json({ success: true, data: result.items, pagination: result.pagination });
});

const getById = asyncHandler(async (req, res) => {
  const post = await postsService.getPostById(req.params.postId);
  res.status(200).json({ success: true, data: post });
});

// req.post attached by authorizeResourceOwnership — ownership already verified.
const update = asyncHandler(async (req, res) => {
  const post = await postsService.updatePost(req.post, req.body);
  res.status(200).json({ success: true, data: post });
});

const remove = asyncHandler(async (req, res) => {
  await postsService.deletePost(req.post);
  res.status(204).send();
});

const moderate = asyncHandler(async (req, res) => {
  const post = await postsService.moderatePost(req.post, req.body.status);
  res.status(200).json({ success: true, data: post });
});

/**
 * Loader middleware reused by comments/reactions routes so "attach
 * comment/reaction to a post" can validate the post actually exists
 * and is visible without duplicating the query.
 */
const loadVisiblePost = asyncHandler(async (req, res, next) => {
  const post = await postsRepository.findVisibleById(req.params.postId);
  if (!post) {
    throw ApiError.notFound('Post not found.');
  }
  req.post = post;
  next();
});

module.exports = { create, getFeed, getById, update, remove, moderate, loadVisiblePost };
