'use strict';

const moderationService = require('./moderation.service');
const { asyncHandler } = require('../../middleware/errorHandler');

// `req.user.id` is the reporter — never trust a `reporterId` in the
// body (section 10).
const fileReport = asyncHandler(async (req, res) => {
  const report = await moderationService.fileReport({ reporterId: req.user.id, ...req.body });
  res.status(201).json({ success: true, data: report });
});

// Staff-only route (see moderation.routes.js's authorizeRole gate).
const listQueue = asyncHandler(async (req, res) => {
  const result = await moderationService.listQueue(req.query);
  res.status(200).json({ success: true, data: result.items, pagination: result.pagination });
});

const resolveReport = asyncHandler(async (req, res) => {
  const report = await moderationService.resolveReport(req.params.reportId, req.user, req.body);
  res.status(200).json({ success: true, data: report });
});

module.exports = { fileReport, listQueue, resolveReport };
