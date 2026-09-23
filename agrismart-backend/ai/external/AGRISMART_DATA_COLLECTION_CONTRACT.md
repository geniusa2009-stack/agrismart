# AgriSmart Telemetry — Data Collection Contract (FINALIZED, backend schema implemented)

**Status update:** this document was originally written as a
recommendation only ("this is a recommendation document, not a schema
change — none of AgriSmart's current Mongo models are modified by this
file"). Following the AI Readiness Gap Analysis
(`GAP_ANALYSIS.md`, produced in the AI training-workspace session that
ran the three real-data experiments documented there), the fields below
have now been IMPLEMENTED in the real backend schema — this is no
longer a recommendation, it is what the schema actually contains as of
this update. See "Implementation status" below for exactly what changed
and, just as important, what deliberately did NOT.

This implementation is a backend schema/validation change only. No AI
model, feature-engineering file, training script, or gate in `ai/` was
modified to produce it, and no model anywhere in this repository was
retrained, retuned, re-validated, or promoted as part of this work —
see "Relationship to the three current AI targets" below.

What the physical AgriSmart system should record once real devices are
deployed, so the AI layer built in this repository can finally train
on real data.

## Recommended fields per telemetry reading

`timestamp, device_id, farm_id, zone_id, soil_moisture, soil_temperature,
soil_ec, salinity, air_temperature (if available), humidity (if available),
rainfall (if available), irrigation_command, irrigation_start,
irrigation_end, water_volume (if available), valve_commanded_state,
valve_confirmed_state, device_health, battery/energy (if available),
sensor_quality`

Everything already present in AgriSmart's real schema today
(`Telemetry`, `Valve`, `DeviceCommand`, `IrrigationEvent`) covers most
of this — the additions this document recommends are: `water_volume`
(not currently captured anywhere — needed for Task 11/14-style
research later), `sensor_quality`/`calibration_status` (see below), and
optional weather fields if a cheap ambient sensor or the Open-Meteo
abstraction (see `ai/README.md` Task 23 discussion) is wired in.

## Recommended sampling frequency: 15 minutes

Not the demo simulator's 4-second tick (built for a live presentation,
never meant to represent real cadence — see `ai/README.md`) and not an
arbitrarily high frequency "for more data." 15 minutes is recommended
because: (1) soil moisture changes on the order of hours, not seconds
— a 4-second or even 1-minute cadence produces enormous, highly
autocorrelated data volume with no additional predictive information
for a 3-hour-horizon irrigation-need model; (2) it matches
`ai/data/syntheticDevData.js`'s own assumption, so a real device
deployed at this cadence needs no changes to the existing feature
engineering's lag/rolling windows (1h/3h/6h); (3) it keeps
battery-powered field devices' duty cycle reasonable. A device that can
report more often is not harmed by reporting at 15-minute granularity
if power is genuinely scarce — this is a recommendation, not a
protocol requirement.

## Quality metadata (recommended additions)

`sensor_quality` (a simple enum: ok / degraded / faulty — set by the
device firmware from its own self-test, not inferred after the fact),
`calibration_status`, `missing_reason` (why a reading is absent, when
known — e.g. "device offline" vs. "sensor fault" vs. "not yet
installed"), `device_firmware_version`, `sensor_model`,
`installation_depth`, `zone`, `crop`, `soil_type`.

None of these currently exist in AgriSmart's schema. They are listed
here because their ABSENCE is exactly what forces
`ai/data/telemetryLoader.js` and `ai/external/quality/qualityEngine.js`
today to treat "missing" and "genuinely zero/normal" as
indistinguishable in several cases — the single highest-leverage
change a future hardware iteration could make for AI training quality.

## Crop / soil / zone context

`crop`, `growth_stage`, `soil_type`, and `field_zone` do not exist
anywhere in the current backend schema. This document recommends
adding them (as optional fields on `Farm` or a new lightweight `Field`
concept) rather than pretending the AI layer already accounts for
them — it does not, today, because the data does not exist. Adding
them is a schema decision for the MVP team, out of scope for this
AI-only workstream to make unilaterally.

## Implementation status (this update)

**Implemented, real schema/route/test changes** (all additive — no
existing field renamed, no existing behavior changed, full test suite
— 241 tests across 45 suites, including the unmodified
`tests/ai/safetyBoundary.test.js` — passes):

- `Telemetry.farmId` / `Telemetry.zoneId` — server-derived from the
  authenticated device at ingestion time (`telemetry.service.js`),
  never accepted from the device payload.
- `Telemetry.readings.soilEcMicrosiemensPerCm` — raw EC, unit in the
  name, kept separate from the pre-existing (already-converted)
  `soilSalinityPpt`.
- `Telemetry.readings.airTemperatureCelsius` /
  `relativeHumidityPercent` / `precipitationMm` — optional weather
  context, exactly this document's `air_temperature (if available),
  humidity (if available), rainfall (if available)`.
- `Telemetry.readings.flowMeter.{cumulativeVolumeLiters,
  flowRateLitersPerMinute}` — optional raw flow-meter sensor readings.
- `IrrigationEvent.appliedWaterVolumeLiters` (this document's
  `water_volume`) — populated ONLY from a value the device itself
  reports when confirming a CLOSE_VALVE command's execution result
  (`commands.validators.js` / `commands.controller.js` /
  `irrigation.service.recordAppliedWaterVolume`); never
  derived/estimated from duration or from a `flowMeter` telemetry
  reading — see `irrigationEvent.model.js`'s header comment for why.
- A new `Zone` model (`farms/zone.model.js`) for `crop` / `growth_stage`
  / `soil_type` / `field_zone` context (this document's own suggested
  "new lightweight Field concept," implemented as `Zone`), with
  `Device.zoneId` / `Valve.zoneId` references and new endpoints:
  `POST /farms/:farmId/zones`, `GET /farms/:farmId/zones`,
  `GET|PATCH|DELETE /zones/:zoneId`,
  `PATCH /devices/:deviceId/zone`, `PATCH /irrigation/valves/:valveId/zone`
  (all reusing existing farm-ownership middleware; cross-farm zone
  assignment is refused with 409, matching every other cross-reference
  in this codebase).
- `readings.temperatureCelsius` and `readings.soilSalinityPpt`
  (pre-existing, unchanged): documented explicitly in
  `telemetry.model.js`'s header comment as soil-probe temperature and
  parts-per-thousand salinity respectively, rather than renamed —
  renaming would have broken the existing, already-tested AI
  feature-engineering read sites for no schema benefit.

**Deliberately NOT implemented this pass** (still open recommendations
from this document, not silently dropped):

- `sensor_quality` / `calibration_status` / `missing_reason` /
  `device_firmware_version` (per-reading) / `sensor_model` /
  `installation_depth` — genuinely useful (see this document's own
  "Quality metadata" section above) but out of scope for this specific
  implementation pass, which followed `GAP_ANALYSIS.md`'s explicit list
  of required fields. Adding them remains a good next increment.
- Any EC-to-salinity conversion formula — still not implemented
  anywhere, still not invented; `soilSalinityPpt` and
  `soilEcMicrosiemensPerCm` remain two independently-reported fields.
- Zone update/delete are implemented (`PATCH`/`DELETE /zones/:zoneId`,
  with a conservative delete-guard mirroring `farms.service.deleteFarm`
  — refuses to delete a zone still referenced by a device or valve),
  but there is no bulk zone-reassignment endpoint; reassigning many
  devices at once is a future increment if the MVP team wants it.

## Relationship to the three current AI targets

This implementation changes what the backend CAN record. It does not,
by itself, change any AI target's real evidence — no telemetry has
actually been collected from real AgriSmart hardware yet (no physical
devices are deployed; see `ai/DATA_READINESS.md`'s "zero real
agricultural telemetry currently exists" finding, still true). Per
`GAP_ANALYSIS.md` section 5:

- `irrigation_event_next_1h` is the target this closes the most
  concrete gap for: its one documented blocker
  (`soilSalinityPpt` 100% missing, no source conversion) is exactly
  what a real AgriSmart soil probe reporting through this schema would
  resolve, once real devices are deployed and report for long enough.
  It remains **not trained / insufficient evidence** until that real
  data exists — this document does not change that status.
- `arnesano_soil_moisture_24h_forecast` and
  `tomato_soil_moisture_estimate` remain **candidate** (the first
  failing `beats_persistence_zone5`, the second failing `beats_mean`
  and `positive_r2`) — both trained on third-party research datasets,
  neither retrained, retuned, or re-evaluated by this change.

No model anywhere in this repository was promoted, retrained, or
retuned as part of implementing this contract.
