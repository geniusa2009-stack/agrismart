'use strict';

const profilesService = require('./profiles.service');
const { asyncHandler } = require('../../middleware/errorHandler');

const getMyProfile = asyncHandler(async (req, res) => {
  const profile = await profilesService.getPublicProfile(req.user.id, req.user);
  res.status(200).json({ success: true, data: profile });
});

const getProfileByUserId = asyncHandler(async (req, res) => {
  const profile = await profilesService.getPublicProfile(req.params.userId, req.user);
  res.status(200).json({ success: true, data: profile });
});

const updateMyProfile = asyncHandler(async (req, res) => {
  const profile = await profilesService.updateMyProfile(req.user.id, req.body);
  res.status(200).json({ success: true, data: profile });
});

module.exports = { getMyProfile, getProfileByUserId, updateMyProfile };
