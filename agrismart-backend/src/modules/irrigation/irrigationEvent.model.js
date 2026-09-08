'use strict';

/**
 * modules/irrigation/irrigationEvent.model.js
 *
 * One document per irrigation cycle (open->close), used to enforce the
 * daily water allowance (Stage 2 section 10/11) via aggregation over
 * today's completed+in-progress durations for a valve. Regular
 * collection (event-shaped but state-mutating over its lifetime, same
 * reasoning as DeviceCommand — not Time Series).
 */

const mongoose = require('mongoose');

const irrigationEventSchema = new mongoose.Schema(
  {
    valveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Valve', required: true, index: true },
    farmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    openCommandId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeviceCommand' },
    closeCommandId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeviceCommand' },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    plannedDurationSeconds: { type: Number, required: true },
    actualDurationSeconds: { type: Number },
    triggeredBy: { type: String, enum: ['manual', 'automated', 'emergency_stop'], required: true },
  },
  { timestamps: true }
);

irrigationEventSchema.index({ valveId: 1, startedAt: 1 });

module.exports = mongoose.model('IrrigationEvent', irrigationEventSchema);
