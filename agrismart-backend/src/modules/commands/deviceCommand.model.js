'use strict';

/**
 * modules/commands/deviceCommand.model.js
 *
 * Device command lifecycle (Stage 2 section 9 / Stage 3 requirement).
 * Regular collection (NOT Time Series) despite being event-shaped: a
 * command has an in-place-updated status over its lifetime
 * (PENDING -> ... -> COMPLETED/FAILED/EXPIRED), which Time Series
 * collections do not support (they're for immutable, append-only
 * inserts) — see ARCHITECTURE_PLAN_STAGE2.md section 10 for why this
 * is called out explicitly as a common mistake to avoid.
 *
 * `commandedState` vs `confirmedState`-bearing fields live on the Valve
 * model (irrigation module), never conflated here — this model only
 * tracks the command's OWN lifecycle, never assumes "sent" means
 * "executed."
 */

const mongoose = require('mongoose');

const COMMAND_TYPE = Object.freeze({
  OPEN_VALVE: 'OPEN_VALVE',
  CLOSE_VALVE: 'CLOSE_VALVE',
  EMERGENCY_STOP: 'EMERGENCY_STOP',
  UPDATE_CONFIGURATION: 'UPDATE_CONFIGURATION',
  RESTART_DEVICE: 'RESTART_DEVICE',
});

const COMMAND_STATUS = Object.freeze({
  PENDING: 'pending',
  QUEUED: 'queued',
  SENT: 'sent',
  ACKNOWLEDGED: 'acknowledged',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  EXPIRED: 'expired',
});

const deviceCommandSchema = new mongoose.Schema(
  {
    idempotencyKey: { type: String, required: true, unique: true },
    deviceId: { type: String, required: true, index: true },
    farmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    issuedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(COMMAND_TYPE), required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: Object.values(COMMAND_STATUS),
      default: COMMAND_STATUS.PENDING,
      index: true,
    },
    statusHistory: [
      {
        status: { type: String },
        at: { type: Date, default: Date.now },
        note: { type: String },
      },
    ],
    expiresAt: { type: Date, required: true, index: true },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    executionResult: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DeviceCommand', deviceCommandSchema);
module.exports.COMMAND_TYPE = COMMAND_TYPE;
module.exports.COMMAND_STATUS = COMMAND_STATUS;
