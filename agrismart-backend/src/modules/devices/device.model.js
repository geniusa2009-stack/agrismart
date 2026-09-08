'use strict';

/**
 * modules/devices/device.model.js
 *
 * Device identity (Stage 2 section 7 / Stage 3 IoT requirements).
 * `deviceSecretHash` is select:false so it's never accidentally
 * returned by a query; only devices.repository.js's dedicated
 * `findByIdWithSecret` projects it in, for authenticateDevice() use.
 *
 * `status` models provisioning/suspension/revocation explicitly rather
 * than a boolean, because "not active" has more than one real-world
 * meaning (never activated vs. deliberately suspended vs. revoked for
 * compromise) and each should be distinguishable in logs/audits.
 */

const mongoose = require('mongoose');

const DEVICE_STATUS = Object.freeze({
  PROVISIONED: 'provisioned',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  REVOKED: 'revoked',
});

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, trim: true },
    farmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    name: { type: String, trim: true },
    deviceSecretHash: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: Object.values(DEVICE_STATUS),
      default: DEVICE_STATUS.PROVISIONED,
    },
    firmwareVersion: { type: String },
    lastSeenAt: { type: Date, default: null },
    lastBatteryPercent: { type: Number, min: 0, max: 100 },
    lastSignalStrengthDbm: { type: Number },
  },
  { timestamps: true }
);


module.exports = mongoose.model('Device', deviceSchema);
module.exports.DEVICE_STATUS = DEVICE_STATUS;
