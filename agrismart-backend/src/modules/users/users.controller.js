'use strict';

const usersService = require('./users.service');
const { asyncHandler } = require('../../middleware/errorHandler');

const getMe = asyncHandler(async (req, res) => {
  const profile = await usersService.getProfile(req.user.id);
  res.status(200).json({ success: true, data: profile });
});

const updateMe = asyncHandler(async (req, res) => {
  const profile = await usersService.updateProfile(req.user.id, req.body);
  res.status(200).json({ success: true, data: profile });
});

module.exports = { getMe, updateMe };
