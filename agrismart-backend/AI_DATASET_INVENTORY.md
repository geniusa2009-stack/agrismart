# AI Dataset Inventory — All 6 Real Datasets Inspected

Status date: 2026-09-11

This inventories every dataset the user attached/named for this phase,
what was actually done with each, and why. Per the "no blind merging"
rule, a dataset is only combined with another when a specific,
justified reason is given — never merely to inflate row counts.

## Summary table

| # | Dataset | Rows/shape (verified) | Role assigned | Reason |
|---|---|---|---|---|
| 1 | Dataset on irrigation for Tomato (Mendeley, 33cngpcrmx.2) | 3,000 rows / 14 cols | **Modeled** — soil-moisture regression | Only dataset here with agronomic/environmental features and a continuous soil-moisture reading; already fully trained (prior phase), negative result, unchanged |
| 2 | IoT Dataset from an Evolving Tomato Cultivation Testbed (2023/2024/2025) | see per-year table below | **Modeled** — irrigation-event onset classification (`irrigation_event_next_1h`) | Only dataset with real per-10-min timestamps + real valve ground truth across multiple seasons, enabling a genuine external-season validation split |
| 3 | IoT-based Dataset of a Tomato Cultivation Under Different Irrigation Regimes ("STUARD") | 4 CSVs, 2023 season only | **Context-only, NOT independently modeled** | Same site, same exact date range (2023-06-29 to 2023-09-13) and same GPS coordinates as dataset #2's own `2023/` folder — very likely the same underlying data as a companion publication. No valve/irrigation stream at all. Cannot serve as an independent external-validation set (would be circular) and cannot support the irrigation-event task on its own. |
| 4 | Soil Moisture, Irrigation Actuator and Weather Dataset | → resolved to be the AgriDataValue/Open-Meteo bundle (see #6) | **See #6** | The zip's actual contents matched dataset #6, not a distinct dataset |
| 5 | 9-Year Industrial Tomato Agro-physiological Dataset | multi-year, season-level agronomic summaries (not IoT sensor time-series) | **Inventoried, NOT modeled** | Different measurement granularity (seasonal/agronomic summary rows, not sensor readings), different crop-management system (industrial processing tomato, not the greenhouse/testbed system datasets #1/#2 describe), and far too few independent season-rows to support a leak-free train/test split for either of this project's two modeled targets |
| 6 | AgriDataValue / Open-Meteo environmental dataset | gridded/point weather time-series | **Inventoried, NOT modeled** | Corn/generic-crop and multi-location weather data with no irrigation/valve/tomato-specific signal at all — no legitimate ML task in this project's scope uses it directly; kept only as potential future weather-feature context, not used in any current model |

## Per-dataset detail

### #1 — Dataset on irrigation for Tomato (unchanged from prior phase)
- 3,000 rows, 14 columns, DOI `10.17632/33cngpcrmx.2`.
- Full inventory/quality/training already documented in the original
  `AI_TRAINING_REPORT.md` (now labeled "Dataset #1" therein) — **not
  restated in full here to avoid duplicating/risking silent drift from
  that already-finalized record.** Result stands: R² = -0.013 on test,
  `candidate`, unpromoted.

### #2 — Evolving Tomato Cultivation Testbed
- Real per-line (5 lines), multi-sensor LoRaWAN deployment, University
  of Parma IoT Laboratory / Azienda Sperimentale Stuard, Italy.
- Three season folders, each with a soil CSV (`soil20XX.csv`) and a
  valve-controller CSV (`valve_controller20XX.csv`) actually ingested
  by this project (other files in each folder — environmental, fruit,
  leaf-temperature, pressure, stem, water-meter — were inventoried via
  README but NOT ingested; they are not required for the irrigation-
  event target and ingesting unused columns would add adapter surface
  area without a modeling justification).
- Verified row counts (2024, the primary training season):
  soil rows + valve rows = adapter's `totalRowsInFile`; after
  restricting to the valve stream's own observed window and rejecting
  3 physically-impossible soil-moisture readings, **accepted 192,716 /
  rejected 297 / excluded-as-outside-valve-window 53,187** canonical
  records (see `AI_DATA_QUALITY_REPORT.md` for the two specific defects
  found and fixed).
- 2023 season: also present, but its own environmental-sensor date
  range and site coordinates are IDENTICAL to STUARD (#3) — see #3's
  entry. 2023 was NOT used as a training or validation season for this
  reason (avoids a circular/non-independent comparison); only 2024
  (primary training + in-season test) and 2025 (fully external
  validation season) were used.
- DOI/citation: the exact separate Mendeley DOI for THIS specific
  multi-year (2023/2024/2025) bundle was searched for (WebSearch/
  WebFetch, including `pmc.ncbi.nlm.nih.gov/articles/PMC12553018`,
  which returned only an unreadable reCAPTCHA page) and **could not be
  confirmed**. Recorded as `doi: null` in the adapter's provenance
  object with an explanatory note rather than guessed, per the
  "never fabricate citations" extension of the project's honesty
  rules. The companion single-season paper (Belli et al., *Data in
  Brief* 60 (2025) 111521, DOI `10.1016/j.dib.2025.111521`, Mendeley
  `35wh56287y`) is cited as "same research group, structurally
  matching 2023 data" — not claimed as this bundle's own citation.

### #3 — STUARD
- `stuard_environmental_data.csv`, `stuard_water_meter_data.csv`,
  `soil_values.csv`, `indicators.csv` — 4 files, single 2023 season,
  3 lines (not 5).
- Confirmed non-independence: exact date range match
  (2023-06-29 to 2023-09-13) and exact device GPS coordinate match
  against dataset #2's `2023/environmental2023.csv`.
- Data-quality finding (not fixed, since this dataset was not
  adapted for modeling): `stuard_soil_data.csv`'s header row is
  duplicated verbatim mid-file (at rows 10862 and 21701), which broke
  a naive `pandas.to_datetime` parse (`OverflowError`) during
  exploratory inspection — consistent with a naive concatenation of
  3 separate per-line CSV exports without stripping repeated headers.
- No valve/irrigation stream exists in this dataset at all, so even
  setting non-independence aside, it cannot support the
  `irrigation_event_next_1h` target.

### #5 — 9-Year Industrial Tomato Agro-physiological Dataset
- Season-level/agronomic-summary rows (yield, growth-stage
  physiological indicators per season), not per-sensor time-series
  readings — a fundamentally different granularity from datasets
  #1/#2/#3.
- Different crop-management context (industrial processing tomato
  cultivation, not the greenhouse/testbed irrigation-control system
  the other tomato datasets describe).
- Effectively n ≈ 9 independent season-rows (one per year) — far too
  few for any leak-free, held-out split; using it would require either
  fabricating a split (violates rule 9/16) or accepting an
  unfalsifiable "model." Inventoried for future reference only.

### #6 — AgriDataValue / Open-Meteo environmental dataset
- Gridded/point weather variables (temperature, precipitation, etc.)
  fetched via Open-Meteo, generic/corn-oriented in its documented
  intended use, no tomato-specific or irrigation-actuation signal.
- No legitimate direct modeling role in this project's two targets
  (tomato soil-moisture regression; tomato irrigation-event onset
  classification) — kept inventoried only as a potential future
  external-weather-feature source, not merged into any current
  training set (merging it in without a documented reason would
  violate rule 6).

## CORRECTION to entry #4 (from the prior phase)

Entry #4, "Soil Moisture, Irrigation Actuator and Weather Dataset,"
was previously recorded as resolving to the AgriDataValue/Open-Meteo
bundle (entry #6). **This was WRONG and is corrected here rather than
silently overwritten** (per the "never delete/hide a prior finding"
rule — the incorrect inference itself is left visible, immediately
above, as a record that it happened). Batch 1 of this new phase
re-attached the actual file under its real name, and it is a
completely different, substantially richer dataset — see entry #11
below. Entry #6 (AgriDataValue/Open-Meteo) stands on its own as
previously documented and is unaffected by this correction.

## Batch 1 (new phase) — 2 datasets forensically audited, NOT yet modeled

Per this phase's explicit instruction ("do NOT train yet, do NOT
merge, wait for remaining batches"), the two datasets below were
deep-audited (empirically verified against their own documentation,
not just read) but no adapter, feature, or model code was written for
either this turn.

### #10 — IoT Dataset from an Evolving Tomato Cultivation Testbed (re-attached)

**Re-verified, not re-audited from scratch.** SHA-256 of the newly
attached zip (`d344d52d-...zip`) is byte-identical
(`8ec428ba...ecbcea`) to the file already fully ingested, quality-
audited, and modeled in the prior phase (entry #2 above). No new
information — the prior phase's full findings, adapter, tests, and
negative `irrigation_event_next_1h` training result stand entirely
unchanged. Re-verification method: `sha256sum` comparison against the
file already committed to
`ai/external/adapters/pending/evolving-tomato-testbed/`.

### #11 — Soil Moisture, Irrigation Actuator and Weather Dataset from a Multi-Sector Precision-Irrigation Field Trial (Arnesano, Apulia, Italy, 2025) — NEW, genuinely different from the prior phase's mistaken guess

- **Site:** Arnesano, Province of Lecce, Apulia, Italy (40.349306 N,
  18.081556 E). **Monitoring period:** 2025-02-09 to 2025-09-27 (one
  growing season — no second season exists in this dataset, unlike
  the Evolving Tomato Testbed).
- **5 irrigation sectors, 4 crop/substrate types:** sector 1 & 2 =
  open-field tomato, sector 3 = potted tomato, sector 4 = zucchini,
  sector 5 = blueberry. A 6th valve/probe ID (`AIRR00006`/`SUT00006`/
  `SNPK00006_*`) exists in the raw telemetry but was never a
  cultivated/monitored sector — confirmed present in the raw files
  (280,852 actuator rows, 819–210,287 sensor rows depending on stream)
  exactly as the README states, and correctly excluded from the
  processed layer.
- **Real measured irrigation ground truth, richer than any other
  dataset in this project:** raw valve telemetry
  (`raw_actuators.csv`, 3,055,944 rows) plus a reconstructed,
  documented, four-phase-filtered event list
  (`final_irrigation_events.csv`, 789 events: 432 standard
  irrigations + 357 fertigations) with explicit `start`, `end`,
  `duration_hours`, `stop_reason` (`fertigation_timeout` 417,
  `physical_valve_closure` 282, `time_restriction` 59,
  `humidity_threshold` 31), and `initial_humidity`/`final_humidity`
  at each transition.
- **Real measured water volume:** applied water is `irrigation
  duration x nominal flow rate` (1.1 L/min for sectors 1-4, 0.4 L/min
  for sector 5 per its own emitter line — the dataset's own registry
  table, `raw_nominal_flow_rates.csv`, generically lists 1.1 for every
  `AIRR*` node, and the merged layer correctly overrides this to 0.4
  for sector 5, while the preprocessed layer's `water_vol_*` columns
  do NOT apply this override, per the dataset's own documented and
  since-verified caveat — see `AI_DATA_QUALITY_REPORT.md`).
- **Weather is NOT on-site-measured** for most of the season: on-site
  outdoor/indoor temperature and humidity probes only have 6.3-26.9%
  coverage (confirmed empirically: `outside_temperature` 93.7% null,
  `inside_temperature` 73.1% null, etc., in the merged layer — matches
  the dataset's own null-percentage table exactly) and are dropped in
  preprocessing; the actually-used weather features
  (`weather_temp`, `weather_humidity`, `weather_rain`,
  `weather_pressure`, `weather_wind_speed`, `weather_radiation`,
  `soil_temperature_0-7cm`, `soil_temperature_7-18cm`) are Open-Meteo
  ERA5 reanalysis, not farm-measured — same underlying source as
  catalog entry #6, but pre-joined onto this dataset's own sensor grid
  rather than a standalone bundle.
- **Row/column counts — every documented count independently
  re-verified this phase (not merely read), all matched exactly:**
  `MEASUREMENT_all.csv` 486,894 rows; the seven `MEASUREMENT_{ce,ph,
  ste,sti,sue,sui,sut}.csv` split files exact row-count matches and
  confirmed to be a true subset of `MEASUREMENT_all.csv` on
  `pk_measurement` (verified via `set.issubset`, not assumed);
  `raw_actuators.csv` 3,055,944 rows, `is_raw` ratio 19.13% (doc:
  19.1%); `raw_measurements.csv` 6,034,225 rows, `is_raw` ratio 8.07%
  (doc: 8.1%); `final_irrigation_events.csv` 789 rows, sector/type/
  stop_reason counts all exact matches to the documented breakdown;
  `dataset_zone_{1..5}.csv` (merged) 33,259 rows each, perfectly
  regular 10-minute grid, zero duplicate timestamps in any of the 5
  files; `dataset_zone_{1..5}_preprocessed.csv` row counts (9,531 /
  11,929 / 1,118 / 12,676 / 11,814) all exact matches.
- **`file_manifest.csv`, `LICENSE.txt`, and `CITATION.cff` are
  referenced by the README's own package-contents listing but are
  NOT present in the attached zip** — recorded here as a genuine,
  minor provenance gap (checksums cannot be independently verified
  against a manifest that was not delivered), not assumed present.
- **Provisional role (subject to change once remaining batches
  arrive):** the strongest single-season candidate in this project for
  soil-moisture forecasting, water-volume prediction, and irrigation-
  event/duration characterization — see `AI_TARGET_CATALOG.md`. NOT
  yet ingested into `ai/external/adapters/` and NOT yet merged with
  any other dataset (rule 6/11) — this phase is audit-only, per
  explicit instruction.

## Files actually committed to the repository this phase
`ai/external/adapters/pending/evolving-tomato-testbed/{2023,2024,2025}/`
— 6 CSV files (soil + valve per season), staged from the user's device,
committed with SHA-256 verification on both sides (see prior phase's
transcript for the exact hashes). All other datasets (#3, #5, #6) were
inspected only in the cloud container's ephemeral scratch space
(`/tmp/ds_inspect/`, not part of the repository) and were not copied
into the repo, since they are not used by any training code.

---

# Final batch (all real datasets now audited) — 3 remaining datasets forensically audited

Status date: 2026-09-11. Per this phase's instruction, these 3 zips
are confirmed byte-identical (SHA-256) to files already present in
this project's upload history from the very first exploratory pass —
but that first pass only lightly inspected them (a README read, or in
one case nothing at all). This section is the actual, full forensic
audit, to the same standard applied to the Evolving Tomato Testbed and
Arnesano datasets.

## #12 — AgriDataValue / Open-Meteo weather bundle (CORRECTS the earlier placeholder entry #6)

This is the file that was previously catalogued only from a generic
web search (`DATASETS.md` entry #6, "Open-Meteo Historical Weather
Archive API — attempted and failed"). The actual attached zip contains
5 real xlsx files, opened and inspected directly this phase:

| File | Rows x cols | Content |
|---|---|---|
| `P18_BIORO_WeatherStationData_AgriDataValue_2024.xlsx` (2 sheets) | 6,739 + 4,809 | Two on-site "BIORO" weather-station nodes, hourly-ish: air temp/humidity/pressure/dew point/precipitation, PLUS `earthHumidity1`/`earthTemperature1` (a generic ground-moisture/temperature proxy — NOT a calibrated per-crop-zone soil probe like the other datasets in this project). Zero nulls. |
| `P18_BIORO_WeatherStationData_AgriDataValue_2025.xlsx` (2 sheets) | 6,378 + 4,186 | Same two stations, 2025. Minor missingness (98/6,378 rows null in some fields). |
| `openmeteo_hourly_weather_data_4598_2047_corn_2025.xlsx` | 4,728 x 21 | Open-Meteo ERA5 hourly, zero nulls, for a **corn** site (per filename) — 21 variables including ET0, VPD, soil temperature bands. |
| `openmeteo_hourly_weather_data_4599_2049_corn_2024.xlsx` | 3,792 x 21 | Same source, different grid cell/year. |
| `openmeteo_hourly_weather_data_4599_2049_corn_2025.xlsx` | 4,728 x 21 | Same source, different grid cell, 2025. |

**Confirmed (not assumed): no irrigation signal of any kind** — no
valve state, no water volume, no irrigation event log, in any of the 5
files. **Confirmed: different crop context** — every Open-Meteo
filename explicitly says "corn," not tomato/zucchini/blueberry. This
independently confirms the prior phase's inference (made without ever
opening the file) was directionally correct in substance (weather-only,
no irrigation relevance) even though it had misidentified which
specific zip this was. **Role: CONTEXT-ONLY.** No irrigation-relevant
ML target is supported by this bundle standing alone.

## #13 — STUARD (IoT-based Dataset of a Tomato Cultivation Under Different Irrigation Regimes) — full re-audit

Prior phase established non-independence with the Evolving Tomato
Testbed's 2023 season (same date range, same GPS coordinates) and
found ONE header-duplication defect in `stuard_soil_data.csv`. This
phase's full re-audit:

- **Exact row counts (verified via `wc -l`, not estimated):**
  `indicators.csv` 77, `stuard_environmental_data.csv` 10,964,
  `stuard_soil_data.csv` 32,668 (raw line count; 32,666 real data rows
  once its 2 duplicated header lines are excluded — see below),
  `stuard_water_meter_data.csv` 32,649 raw lines.
- **NEW finding this phase: `stuard_water_meter_data.csv` has the SAME
  header-duplication defect previously found only in
  `stuard_soil_data.csv`.** Both files are naive concatenations of 3
  separate per-line CSV exports without stripping repeated headers
  (soil: header rows at lines 1, 10864, 21703; water meter: header rows
  at lines 1, 10802, 21709). This was missed in the prior phase's
  partial audit and is corrected here. Once headers are stripped:
  soil = 32,666 real rows (lines 1/2/3: 10,966 / 10,862 / 10,838),
  water meter = 32,647 real rows (lines 1/2/3: 10,800 / 10,906 /
  10,941).
- **Water-meter cumulative-volume sanity check (new this phase):**
  `current_volume` is a cumulative per-line meter reading. It is
  monotonically non-decreasing in lines 1 and 2 (0 decreases) but has
  3 anomalous decreases in line 3 — a minor, specific data-quality
  finding (likely a meter reset or read glitch), noted but not further
  investigated since this dataset is not being adapted for training.
- **Soil data (new this phase, full check):** humidity (soil moisture)
  is within [0, 56.81]%, entirely within the physically plausible
  [0,100] range — zero implausible values, unlike Arnesano's
  equivalent probes. EC range [0, 1767] uS/cm, zero duplicate
  (timestamp, line) pairs.
- **Confirmed again: no irrigation/valve stream of any kind** in any
  of the 4 files — `indicators.csv` is purely derived daily agronomic
  indicators (GDD, heat units), not a valve/actuator log.
- **Role: REJECTED** for both independent training and independent
  validation — confirmed non-independent with Evolving Tomato
  Testbed's 2023 season (unchanged finding) AND confirmed to have no
  irrigation ground truth at all (unchanged finding), now with a fully
  quantified quality picture on top.

## #14 — 9-Year Industrial Tomato Agro-physiological Dataset — MAJOR CORRECTION to the prior phase's characterization

The prior phase's inventory entry for this dataset was written from
inference/assumption without opening the file, and was **WRONG in a
way that undersold this dataset.** It was described as "season-level
agronomic-summary rows... effectively n ~ 9 independent season-rows...
too few for a leak-free split." Having now actually opened the file
(a single `tomato_dataset_2111.xlsx` with 8 sheets), the real content
is substantially richer:

| Sheet | Rows x cols | Content |
|---|---|---|
| `metadata` | 53 x 6 | Full column dictionary (unusually well documented) |
| `Experiment` | **32** x 6 | 32 distinct experiment-year x irrigation-regime combinations (not 9) — single cultivar "Ulisse" throughout, across 9 CALENDAR years: 2005, 2006, 2012-2018 (2007-2011 is a real, documented gap — not a data error) |
| `Phenology` | 48 x 3 | Phenological-stage-end dates per experiment |
| `Weather` | **949** x 8 | Real DAILY weather (max/min temp, precipitation, solar radiation, max/min RH, wind), 2005-04-28 to 2018-08-05, ZERO missing values, zero duplicate dates |
| `Crop` | 100 x 12 | Yield/quality outcomes (marketable/green/rotten/total yield, fruit weight, brix, pH, acidity, color) per experiment x replicate |
| `Soil` | 32 x 6 | Per-experiment soil texture (sand/clay/silt %) and field capacity/wilting point |
| `Irrigation` | **524** x 3 | REAL irrigation EVENT dates and water depth applied (mm) per experiment — this project's prior phase's claim that this dataset has "no valve/irrigation stream" was WRONG; it has real, dated, per-experiment irrigation applications, just not sub-daily sensor telemetry. Zero duplicate (ID, DATE) pairs, zero nulls, date range 2005-04-28 to 2018-07-23. |
| `physiology` | 188 x 7 | Real crop water stress index (CWSI, a physiologically meaningful continuous water-stress measurement derived from canopy-vs-air temperature), stomatal conductance (mostly missing: 176/188 null), 2005-06-13 to 2016-07-20 |

**Irrigation regime is a genuine designed-experiment treatment
variable** (`IRR_M`: 0%/50%/75%/100% restitution of crop water
consumption, plus several split-season regime codes), not something
to predict from sensors — this dataset's scientific design is a
controlled water-saving-strategy comparison, not a telemetry stream.

**Corrected role: still CONTEXT-ONLY / NOT modeled this phase, but for
a different and more specific reason than previously stated.** The
richer content (949 weather-days, 524 irrigation-dates, 188 CWSI
readings) is real and usable in principle, but every one of those rows
is grouped under only 32 experiment IDs, spanning a 6-year real gap in
the calendar (2007-2011) and a single site/cultivar — a leak-free,
grouped split by experiment ID would leave only a handful of held-out
experiment-groups for testing, an unusually thin evidence base for any
promotable model, and the target most naturally supported by this data
(CWSI or yield as a function of irrigation regime x weather) is a
different kind of scientific question (a designed-experiment causal
comparison across regimes) than the forecasting/classification tasks
this project's infrastructure is built around. Reconsideration
recommended as a candidate for a dedicated, small-sample-aware
analysis in a future phase, not folded into this phase's training
runs.

## FINAL DATASET ROLE ASSIGNMENTS (all 9 real datasets, cumulative)

| # | Dataset | FINAL role |
|---|---|---|
| 1 | Dataset on irrigation for Tomato (Mendeley) | **PRIMARY TRAINING** (already trained, negative result, `candidate`) |
| 2 | Evolving Tomato Cultivation Testbed | **PRIMARY TRAINING** (2024) + **EXTERNAL VALIDATION** (2025) (already trained, negative result, `candidate`) |
| 3 (10/13) | STUARD | **REJECTED** (non-independent with #2's 2023 season; no irrigation stream) |
| 4/6 (12) | AgriDataValue / Open-Meteo | **CONTEXT-ONLY** (no irrigation signal, different crop) |
| 5 (14) | 9-Year Industrial Tomato | **CONTEXT-ONLY** (richer than previously stated, but too few independent experiment-groups for a defensible held-out split against this project's targets) |
| 11 | Arnesano zones 1, 2, 4 | **PRIMARY TRAINING** (this phase — see AI_TRAINING_REPORT.md) |
| 11 | Arnesano zone 5 (blueberry) | **VALIDATION** (cross-crop, held out, no retraining — this phase) |
| 11 | Arnesano zone 3 (potted tomato) | **REJECTED** (worst sensor quality of any zone in this project) |

No dataset was merged with another at the row level anywhere in this
project. Every cross-dataset comparison performed (STUARD vs. Evolving
Tomato 2023; Arnesano zones 1/2/4 vs. zone 5) compares MODEL
PERFORMANCE or PROVENANCE across independently-loaded datasets/zones —
never concatenates their rows into one training set.
