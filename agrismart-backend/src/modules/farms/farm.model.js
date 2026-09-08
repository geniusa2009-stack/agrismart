'use strict';

/**
 * modules/farms/farm.model.js
 *
 * Minimal Farm entity — exists in Stage 3 primarily as the ownership
 * boundary that devices/telemetry/commands/irrigation all hang off
 * (Stage 2 section 6/11). Fields/Crops/Sensors/Notifications/AuditLog
 * modules from the Stage 2 plan are intentionally NOT implemented in
 * this pass — see the Stage 3 completion report's "scope" note.
 */

const mongoose = require('mongoose');

const farmSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    location: {
      governorate: { type: String, trim: true },
      village: { type: String, trim: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Farm', farmSchema);
