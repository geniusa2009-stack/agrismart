'use strict';

/**
 * modules/moderation/report.model.js
 *
 * A single shared report model for every reportable content type
 * (Overnight Community task, section 12) rather than one report model
 * per module — a report is structurally identical regardless of what
 * it targets, and a shared model lets moderators see one unified queue.
 * `targetType` + `targetId` is a polymorphic reference (no `ref:` on
 * targetId since it points at different collections depending on
 * targetType); resolving it to an actual document is the moderation
 * service's job, not the schema's.
 */

const mongoose = require('mongoose');

const REPORT_TARGET_TYPES = ['post', 'comment', 'user', 'equipment', 'marketplace_listing', 'service'];
const REPORT_REASONS = [
  'spam',
  'misleading_info',
  'scam_fraud',
  'inappropriate_content',
  'harassment',
  'fake_listing',
  'other',
];

const reportSchema = new mongoose.Schema(
  {
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: REPORT_TARGET_TYPES, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    description: { type: String, trim: true, maxlength: 1000 },

    status: { type: String, enum: ['open', 'reviewing', 'resolved', 'dismissed'], default: 'open', index: true },

    // Auditability (section 23): who acted, when, and the resulting
    // decision — never who they are beyond an id reference (no PII
    // duplicated into the audit trail).
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    resolutionNote: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

// One open report per (reporter, target) — a duplicate-report-spam
// guard (section 12) enforced by the unique index itself, not just
// application logic, so a retry/double-click can't create duplicates.
reportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model('CommunityReport', reportSchema);
module.exports.REPORT_TARGET_TYPES = REPORT_TARGET_TYPES;
module.exports.REPORT_REASONS = REPORT_REASONS;
