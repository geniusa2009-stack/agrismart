'use strict';

const commentsService = require('./comments.service');
const { asyncHandler } = require('../../middleware/errorHandler');

const create = asyncHandler(async (req, res) => {
  const comment = await commentsService.createComment(req.post, req.user.id, req.body.body);
  res.status(201).json({ success: true, data: comment });
});

const list = asyncHandler(async (req, res) => {
  const result = await commentsService.listForPost(req.post._id, req.query);
  res.status(200).json({ success: true, data: result.items, pagination: result.pagination });
});

// req.comment attached by authorizeResourceOwnership — ownership already verified.
const update = asyncHandler(async (req, res) => {
  const comment = await commentsService.updateComment(req.comment, req.body.body);
  res.status(200).json({ success: true, data: comment });
});

const remove = asyncHandler(async (req, res) => {
  await commentsService.deleteComment(req.comment);
  res.status(204).send();
});

const moderate = asyncHandler(async (req, res) => {
  const comment = await commentsService.moderateComment(req.comment, req.body.status);
  res.status(200).json({ success: true, data: comment });
});

module.exports = { create, list, update, remove, moderate };
