'use strict';

/**
 * modules/irrigation/valve.model.js
 *
 * `commandedState` (what we last told the device to do) and
 * `confirmedState` (what the device has actually confirmed doing) are
 * deliberately SEPARATE fields — Stage 2 section 10: "never conflate
 * what we told the device to do with what we've confirmed it did."
 * `confirmedState` is only ever updated from a device-reported command
 * execution result, never from the act of issuing a command.
 *
 * Automation fields (MVP "Automation Settings" feature): when
 * `automationEnabled` is true, telemetry.service.ingest() calls
 * irrigation.service.evaluateAutomation() after every reading for this
 * valve's device, which opens the valve once soil moisture drops below
 * `autoOpenBelowPercent` and closes it once moisture recovers above
 * `autoCloseAbovePercent` — the exact same threshold-crossing pattern
 * already used by scripts/demoSimulator.js and the dashboard's derived
 * alerts, now applied to real (not just simulated) telemetry. This is
 * deliberately simple (two thresholds, one duration cap) rather than a
 * rules engine — promote it only if the post-MVP phase actually needs
 * more.
 */

const mongoose = require('mongoose');

const VALVE_STATE = Object.freeze({
  OPEN: 'open',
  CLOSED: 'closed',
  UNKNOWN: 'unknown',
});

const valveSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, index: true },
    farmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    name: { type: String, trim: true },
    commandedState: { type: String, enum: Object.values(VALVE_STATE), default: VALVE_STATE.CLOSED },
    confirmedState: { type: String, enum: Object.values(VALVE_STATE), default: VALVE_STATE.UNKNOWN },
    confirmedStateAt: { type: Date },
    lastOpenedAt: { type: Date },
    lastClosedAt: { type: Date },
    automationEnabled: { type: Boolean, default: false },
    autoOpenBelowPercent: { type: Number, min: 0, max: 100, default: 30 },
    autoCloseAbovePercent: { type: Number, min: 0, max: 100, default: 55 },
    autoDurationSeconds: { type: Number, min: 1, default: 300 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Valve', valveSchema);
module.exports.VALVE_STATE = VALVE_STATE;
