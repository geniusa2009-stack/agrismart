'use strict';

const Notification = require('./notification.model');

async function create({ userId, type, data }) {
  return Notification.create({ userId, type, data: data || {} });
}

async function listForUser(userId, { skip, limit }) {
  return Notification.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
}

async function countForUser(userId) {
  return Notification.countDocuments({ userId });
}

async function countUnreadForUser(userId) {
  return Notification.countDocuments({ userId, readAt: null });
}

/**
 * Ownership is folded into the query itself (same anti-IDOR pattern as
 * farms.repository.findByIdForPrincipal) — marking someone else's
 * notification read simply matches zero documents.
 */
async function markRead(notificationId, userId) {
  return Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { readAt: new Date() } },
    { new: true }
  );
}

async function markAllRead(userId) {
  return Notification.updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } });
}

module.exports = { create, listForUser, countForUser, countUnreadForUser, markRead, markAllRead };
