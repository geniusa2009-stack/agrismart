'use strict';

const notificationsService = require('./notifications.service');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');

const list = asyncHandler(async (req, res) => {
  const result = await notificationsService.listForUser(req.user.id, req.query);
  res.status(200).json({ success: true, data: result.items, pagination: result.pagination, unreadCount: result.unreadCount });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationsService.markRead(req.params.notificationId, req.user.id);
  if (!notification) {
    throw ApiError.notFound('Notification not found.');
  }
  res.status(200).json({ success: true, data: notification });
});

const markAllRead = asyncHandler(async (req, res) => {
  await notificationsService.markAllRead(req.user.id);
  res.status(200).json({ success: true });
});

module.exports = { list, markRead, markAllRead };
