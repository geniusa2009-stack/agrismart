'use strict';

const reactionsService = require('./reactions.service');
const { asyncHandler } = require('../../middleware/errorHandler');

const toggle = asyncHandler(async (req, res) => {
  const result = await reactionsService.toggleReactionOnPost(req.user.id, req.post, req.body.type);
  res.status(200).json({ success: true, data: result });
});

module.exports = { toggle };
