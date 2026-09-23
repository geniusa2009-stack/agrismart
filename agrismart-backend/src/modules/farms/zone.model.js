'use strict';

/**
 * modules/farms/zone.model.js
 *
 * Implements the "field_zone" / "crop" / "growth_stage" / "soil_type"
 * context recommended (but explicitly NOT implemented) by
 * ai/external/AGRISMART_DATA_COLLECTION_CONTRACT.md's "Crop / soil /
 * zone context" section: "This document recommends adding them ... as
 * optional fields on Farm or a new lightweight Field concept ... a
 * schema decision for the MVP team, out of scope for this AI-only
 * workstream to make unilaterally."
 *
 * Decision made here (MVP team scope, not the AI workstream): a new
 * lightweight `Zone` collection, one per physical field/plot on a farm,
 * rather than piling optional fields onto `Farm` — a farm can have more
 * than one zone/crop, and `Device`/`Valve` each reference at most one
 * zone via `zoneId` (see those models). This mirrors the existing
 * `farmId` ownership-boundary pattern exactly (Stage 2 section 6/11).
 *
 * No AI training code, feature engineering, model, or gate reads this
 * model — this is a backend data-collection schema addition only. The
 * three existing AI targets remain unaffected (see GAP_ANALYSIS.md /
 * AGRISMART_DATA_COLLECTION_CONTRACT.md).
 */

const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema(
  {
    farmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Free-text on purpose (Stage: MVP) — no fixed crop taxonomy exists
    // anywhere in this repo yet. Do not infer/validate against an
    // invented enum; that would be exactly the kind of fabricated
    // semantics this workstream is required not to introduce.
    cropType: { type: String, trim: true, maxlength: 120 },
    growthStage: { type: String, trim: true, maxlength: 60 },
    soilType: { type: String, trim: true, maxlength: 60 },
    plantingDate: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Zone', zoneSchema);
