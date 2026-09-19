'use strict';

/**
 * modules/notifications/notification.model.js
 *
 * Polling-based notification record (Overnight Community task, section
 * 14: "do not require real-time WebSockets if the infrastructure isn't
 * ready" — it isn't; the existing frontend already polls other
 * endpoints via usePolling, so this is consistent with the current
 * architecture, not a downgrade). `data` carries just enough structured
 * context (ids) for the frontend to deep-link, never full denormalized
 * copies of the source content — avoids staleness and keeps documents
 * small.
 */

const mongoose = require('mongoose');

const NOTIFICATION_TYPES = [
  'rental_requested',
  'rental_accepted',
  'rental_rejected',
  'rental_cancelled',
  'rental_completed',
  'service_requested',
  'service_accepted',
  'service_rejected',
  'service_completed',
  'service_cancelled',
  'new_comment',
  'new_reaction',
  'new_follower',
  'moderation_action',
  'review_received',
  'marketplace_inquiry',
];

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    // Free-form but bounded structured payload — e.g. { postId, actorId }
    // or { rentalRequestId, equipmentId }. Never secrets, never full
    // message bodies (those can change/be removed after the fact).
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
