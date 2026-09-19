# AI Split Protocol

Status date: 2026-09-11. Documents the exact split strategy used for
each modeled target, and why, per rules 8/9/10 (no temporal leakage;
never randomly split time-series when chronology matters; future
measurements never become features for past predictions).

## Dataset #1 — `tomato_soil_moisture_estimate`
Unchanged from the prior phase: grouped, chronological split by
planting day (`ai/training/tomato/splitByPlantingDay.js`) — rows from
the same planting-day group never span train/test, and later
days-since-planting values are never used to predict earlier ones.
See the original `AI_TRAINING_REPORT.md` for full detail; not repeated
here.

## Dataset #2 — `irrigation_event_next_1h`

**Primary split (2024 season): chronological 70/15/15**, via the
reused `ai/external/benchmark/splitChronological.js` — train gets the
earliest 70% of the season by timestamp, validation the next 15%, test
the final 15%. No shuffling, no random assignment: a later reading is
never in train while an earlier reading from the same season is in
test.

**Feature leak-freedom:** every feature comes from
`ai/features/featureEngineering.js`'s `computeFeatures(history, asOf)`,
which by construction only reads history with `recordedAt <= asOf`
(enforced/tested by the pre-existing
`tests/ai/featureEngineering.test.js` leakage test, reused unchanged).

**Label leak-freedom:** `computeIrrigationEventLabel(irrigationHistory,
asOf, horizonMs, observedThroughMs)` only looks at events starting in
`(asOf, asOf + horizonMs]` — strictly future relative to the example's
own `asOf` — and refuses to return a value (`null`) rather than
guessing when `observedThroughMs < asOf + horizonMs`, i.e. when the
label window is not fully within the observed data. See
`tests/ai/evolvingTomato/irrigationEventLabel.test.js` for direct unit
coverage of this boundary.

**Known, accepted limitation of the primary split:** the 2024 season
exhibits strong non-stationarity (irrigation-onset frequency rises
through mid-season and falls late-season — see
`AI_DATA_QUALITY_REPORT.md`), so the chronological test tail is not a
uniformly representative sample of the full season's activity level.
This is a genuine property of a single-season chronological split
applied to a seasonal process, not a bug, and is reported rather than
patched with a non-chronological (leakier) alternative.

**External validation (2025 season): fully held out, no retraining.**
The model trained ONLY on 2024 data is applied, unmodified, to the
entire 2025 season. This is a stronger generalization test than a
same-season holdout: 2025 is a different year with its own weather,
planting timing, and irrigation-controller behavior. STUARD (2023) was
explicitly NOT used for this purpose because it is very likely the
same underlying data as dataset #2's own 2023 folder (see
`AI_DATASET_INVENTORY.md`) — using it would be a circular, non-
independent "external" test.

**Dual-condition validation gate (stricter than dataset #1's):** a
model is only promoted out of `candidate` if it clears
`averagePrecision > 3× base rate` AND `rocAuc > 0.75` on **both** the
2024 in-season test **and** the fully external 2025 season. Both
conditions failed (2024 test: rocAuc 0.2619; 2025: rocAuc 0.3133) — see
`AI_TRAINING_REPORT.md`.

**Sampling stride (not a leakage issue, but documented here since it
affects which timestamps become examples):** examples are built at a
fixed stride (every 6th ~10-minute reading, ~hourly) rather than one
per raw reading, purely for compute tractability given
`computeFeatures`'s per-call O(n) history scan over tens of thousands
of real readings per zone (benchmarked ~20.5s for a full season at
stride 6). This changes HOW MANY examples exist, not which time
direction they look — leak-freedom is unaffected.

---

# Arnesano — `arnesano_soil_moisture_24h_forecast`

**Target rebuild (the key leakage-adjacent fix this phase):** the
dataset's own published "24-hour-ahead" target column is NOT reliably
24 hours ahead once rows with missing readings are dropped (as low as
0% of rows are exactly +24h in zone 3, per AI_DATA_QUALITY_REPORT.md
Finding 1). This project therefore rebuilds the target directly from
the gap-preserving "merged" layer: label(i) = soilMoisture at row
i+144, used ONLY when that exact future row has a valid reading, with
a defensive assertion (and skip-and-count) that the elapsed time is
truly 24h. This is unit-tested (`tests/ai/arnesano/buildExamples.test.js`)
including a synthetic case where the +144 row's timestamp is corrupted
to NOT be +24h, verifying the pipeline skips rather than mislabels it.

**Features:** every feature is either concurrent (same row as the
label's starting point) or strictly backward-looking (`waterLitersPast4h`
sums the preceding 24 steps / 4 hours). The dataset's own documented
forward-looking columns (`water_vol_to_24h`, `real_moisture_delta`)
are NOT ingested by this project's adapter at all — not merely
unused, structurally absent from the feature space.

**Split:** zones 1, 2, 4 pooled and sorted chronologically (valid: all
three zones share the same real calendar), then a plain 70/15/15
chronological cut (train/validation/test) — no shuffling. Zone 5
(blueberry) is held out ENTIRELY and evaluated only after the model is
finalized on zones 1/2/4, with NO retraining — this project's
cross-crop generalization check, the closest analogue this
single-season dataset supports to the Evolving Tomato Testbed's
2024->2025 cross-season check. Zone 3 (potted tomato) is excluded from
every role given its documented severe sensor-quality problems.

**Why a global chronological cut across pooled zones is valid:** zones
1/2/4 are different physical sensors/valves at the same site sharing
the same real-world calendar and weather forcing — a train/validation/test
cut by wall-clock time cannot leak one zone's "future" into another
zone's "past," since all three zones' clocks are the same clock.
