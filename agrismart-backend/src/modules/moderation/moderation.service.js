'use strict';

/**
 * modules/moderation/moderation.service.js
 *
 * Owns the REPORT lifecycle only (create / queue / resolve) — the
 * actual "hide this post" / "remove this listing" action lives on each
 * content module's own moderation-gated route (e.g.
 * community/posts.controller.js's `moderate`), not here, per the task
 * brief's "keep domain boundaries clean" instruction. This keeps
 * moderation.service.js from needing to know about every content
 * type's internal shape while still giving moderators one unified
 * report queue to work from.
 */

const moderationRepository = require('./moderation.repository');
const { resolvePagination, paginatedResponse } = require('../../utils/pagination');
const { ApiError } = require('../../middleware/errorHandler');
const metrics = require('../../observability/metrics');
const logger = require('../../observability/logger');

async function fileReport({ reporterId, targetType, targetId, reason, description }) {
  try {
    const report = await moderationRepository.create({ reporterId, targetType, targetId, reason, description });
    metrics.increment('content_reported_total');
    logger.info({ reporterId, targetType, targetId, reason }, 'content_reported');
    return report;
  } catch (err) {
    // Unique index (reporterId, targetType, targetId) — same duplicate-
    // key translation pattern as auth.service.js's register(): a raw
    // Mongo 11000 becomes a clean, documented 409 instead of a bare 500.
    if (err && err.code === 11000) {
      throw ApiError.conflict('You have already reported this.');
    }
    throw err;
  }
}

async function listQueue(query) {
  const { page, limit, skip } = resolvePagination(query);
  const { items, total } = await moderationRepository.listQueue({ status: query.status, skip, limit });
  return paginatedResponse(items, total, { page, limit });
}

const VALID_TRANSITIONS = {
  open: ['reviewing', 'resolved', 'dismissed'],
  reviewing: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};

/**
 * `moderator` is the authenticated staff principal (req.user), never a
 * client-supplied resolvedBy — same "never trust an id from the
 * client" rule as every other ownership field in this codebase.
 */
async function resolveReport(reportId, moderator, { status, resolutionNote }) {
  const report = await moderationRepository.findById(reportId);
  if (!report) {
    throw ApiError.notFound('Report not found.');
  }

  const allowed = VALID_TRANSITIONS[report.status] || [];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(`Cannot transition a report from '${report.status}' to '${status}'.`);
  }

  const updated = await moderationRepository.resolve(reportId, {
    status,
    resolvedBy: moderator.id,
    resolutionNote,
  });
  metrics.increment('moderation_action_total');
  logger.info({ reportId, moderatorId: moderator.id, status }, 'moderation_action');
  return updated;
}

module.exports = { fileReport, listQueue, resolveReport };
