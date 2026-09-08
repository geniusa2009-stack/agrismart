'use strict';

/**
 * modules/dashboard/alertAcknowledgement.model.js
 *
 * Dashboard alerts (dashboard.service.js's getAlertsForFarm) are
 * computed fresh on every read, NOT stored — see that file's header
 * comment for why. But "mark as resolved" needs SOMETHING durable, or
 * every acknowledge would be forgotten on the next poll. This is the
 * minimal durable piece: one row per (farmId, alertId) that has been
 * acknowledged. It records that a human dismissed a specific
 * *computed* alert — it does not store the alert's content, since the
 * content is always recomputed from the real underlying data.
 *
 * `alertId` is the same deterministic string dashboard.service.js
 * already builds (e.g. "moisture-low:<deviceId>:<telemetryDocId>"),
 * which is why acknowledging a real, still-true condition (e.g. a
 * device still offline) reappears next time it's recomputed with a
 * fresh id — this is a lightweight per-occurrence dismissal, not a
 * mute/snooze rule. That's an explicit, documented MVP simplification,
 * not a bug.
 */

const mongoose = require('mongoose');

const alertAcknowledgementSchema = new mongoose.Schema(
  {
    farmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    alertId: { type: String, required: true },
    acknowledgedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    acknowledgedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

alertAcknowledgementSchema.index({ farmId: 1, alertId: 1 }, { unique: true });

module.exports = mongoose.model('AlertAcknowledgement', alertAcknowledgementSchema);
