# Future AgriSmart Telemetry — Recommended Data Collection Contract

What the physical AgriSmart system should record once real devices are
deployed, so the AI layer built in this repository can finally train
on real data. This is a recommendation document, not a schema change —
none of AgriSmart's current Mongo models are modified by this file.

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
