'use strict';

/**
 * modules/notifications/notifications.service.js
 *
 * `notify()` is the ONE function every other domain service calls to
 * raise a notification — a deliberately thin abstraction (Overnight
 * Community task, section 14) so a future realtime push transport
 * (WebSocket/SSE/push notification) can be added by changing this one
 * function's implementation, without touching any of its ~15 call
 * sites across rentals/services/community. Never throws: a
 * notification failure must never fail the primary action that
 * triggered it (e.g. a rental request should still succeed even if
 * writing the "you have a new request" notification fails).
 */

const notificationsRepository = require('./notifications.repository');
const logger = require('../../observability/logger');
const { resolvePagination, paginatedResponse } = require('../../utils/pagination');

async function notify({ userId, type, data }) {
  try {
    await notificationsRepository.create({ userId, type, data });
  } catch (err) {
    logger.warn({ err, userId, type }, 'Failed to write notification (non-fatal).');
  }
}

async function listForUser(userId, query) {
  const { page, limit, skip } = resolvePagination(query);
  const [items, total, unreadCount] = await Promise.all([
    notificationsRepository.listForUser(userId, { skip, limit }),
    notificationsRepository.countForUser(userId),
    notificationsRepository.countUnreadForUser(userId),
  ]);
  return { ...paginatedResponse(items, total, { page, limit }), unreadCount };
}

async function markRead(notificationId, userId) {
  return notificationsRepository.markRead(notificationId, userId);
}

async function markAllRead(userId) {
  return notificationsRepository.markAllRead(userId);
}

module.exports = { notify, listForUser, markRead, markAllRead };
