'use strict';

/**
 * modules/irrigation/irrigationEvent.model.js
 *
 * One document per irrigation cycle (open->close), used to enforce the
 * daily water allowance (Stage 2 section 10/11) via aggregation over
 * today's completed+in-progress durations for a valve. Regular
 * collection (event-shaped but state-mutating over its lifetime, same
 * reasoning as DeviceCommand — not Time Series).
 *
 * `appliedWaterVolumeLiters` (AgriSmart-native data collection
 * contract — see ai/external/AGRISMART_DATA_COLLECTION_CONTRACT.md,
 * `water_volume`) is populated ONLY from a value the device itself
 * reports when it confirms the CLOSE_VALVE command's execution result
 * (commands.controller.js's reportExecutionResult ->
 * irrigation.service.recordAppliedWaterVolume() -> here, matched by
 * `closeCommandId`). It is deliberately NEVER computed/estimated by
 * this backend from `plannedDurationSeconds`, `actualDurationSeconds`,
 * or any Telemetry `flowMeter` reading — durations do not reliably
 * convert to a volume (flow rate varies with line pressure, valve
 * wear, etc.), and correlating a separate Telemetry flow-meter stream
 * to this event's exact window would require assumptions about clock
 * sync and reading cadence this backend has no evidence for. That
 * would be exactly the kind of invented conversion this workstream is
 * required not to introduce. If a device has no flow meter, this field
 * stays null — that is the honest state, not an error.
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
    // Unit: liters. See header comment — populated only from an
    // explicit device-reported value, never derived/estimated here.
    appliedWaterVolumeLiters: { type: Number, min: 0, default: null },
    triggeredBy: { type: String, enum: ['manual', 'automated', 'emergency_stop'], required: true },
  },
  { timestamps: true }
);

irrigationEventSchema.index({ valveId: 1, startedAt: 1 });

module.exports = mongoose.model('IrrigationEvent', irrigationEventSchema);
