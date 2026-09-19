'use strict';

const followsService = require('./follows.service');
const { asyncHandler } = require('../../middleware/errorHandler');

const follow = asyncHandler(async (req, res) => {
  await followsService.follow(req.user.id, req.params.userId);
  res.status(204).send();
});

const unfollow = asyncHandler(async (req, res) => {
  await followsService.unfollow(req.user.id, req.params.userId);
  res.status(204).send();
});

module.exports = { follow, unfollow };
