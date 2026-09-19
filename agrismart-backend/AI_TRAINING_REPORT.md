# AI Training Report — Real Data Phase (Tomato Irrigation Dataset)

Status date: 2026-09-11
Scope: this report covers ONLY the real-data training phase described
below. It does not restate the full architecture already documented in
`AI_INTELLIGENCE_REPORT.md` (workstream 1) and `AI_RESEARCH_REPORT.md` /
`DATASETS.md` (workstream 2) — see those for the irrigation-need
classifier and the external-benchmark infrastructure, both of which
remain unchanged by this work.

## 0. One-paragraph summary (read this first)

A real, user-attached dataset (Mendeley "Dataset on irrigation for
Tomato", DOI 10.17632/33cngpcrmx.2) was ingested, audited, and used to
train a soil-moisture regression model. The dataset has **no
irrigation decision/valve label of any kind**, so no irrigation-control
target was invented — per instruction, none was. The strongest
defensible alternative target given the actual columns was estimating
the **current** soil-moisture reading from other **concurrent**
environmental/agronomic measurements. After a leak-free, group-aware
chronological split and a documented baseline comparison, **the
trained model did not beat a simple baseline and does not meet this
project's own validation criteria.** It is saved in the model registry
as `status: "candidate"` and the inference API refuses to serve it
(returns "unavailable" with an explicit reason). This is reported as
the honest result of the experiment, not a success — see Sections 8–10
for why, and Section 11 for what a better next dataset would need to
look like.

---

## 1. REAL DATA — the dataset actually used

- **Name:** Dataset on irrigation for Tomato
- **Source:** Mendeley Data
- **DOI:** `10.17632/33cngpcrmx.2`
- **URL:** https://data.mendeley.com/datasets/33cngpcrmx/2
- **Version:** 2 (per the Mendeley page, published 13 Nov 2024)
- **How it entered this project:** identified via web search/fetch of
  the public Mendeley page (this session could not download the file
  itself — see Section 12, "Environment constraints"). The user
  downloaded the file manually and attached it to the chat. It was
  then copied byte-for-byte into this repository at
  `ai/external/adapters/pending/tomato_irrigation_dataset.csv` and its
  SHA-256 was verified identical before and after the copy:
  `376c12753e37c9803df4669ae9f8a99331e4d358a3c336ad3ba93d64a4ac01ca`.
- **License:** **not specified** in the page content this session
  could retrieve. Recorded honestly as unknown/unconfirmed in
  `provenance.license` rather than assumed to be permissive — treat as
  all-rights-reserved until the depositor's license is confirmed
  directly on data.mendeley.com or by contacting the authors before
  any redistribution or commercial use.
- **Authors / location:** not specified in the retrievable page
  content. Crop is stated as Tomato; growing location is unspecified.
- **Sensors described on the dataset page:** BME280
  (temperature/humidity/pressure), SEN0193 capacitive soil-moisture
  sensor, an RS485 NPK sensor (mg/kg), plus a weather API for wind
  speed and solar radiation.
- **Row/column count (verified programmatically, not asserted):**
  3,000 data rows, 14 columns, 0 null cells in any column.
- **Original columns, exactly as delivered** (whitespace preserved
  from the source header):
  `Temperature [_ C] `, `Humidity [%]`, `Soil moisture`,
  `Reference evapotranspiration`, `Evapotranspiration`,
  `Crop Coefficient`, `Crop Coefficient stage`, `Nitrogen [mg/kg]`,
  `Phosphorus [mg/kg]`, `Potassium`, `Solar Radiation ghi`,
  `Wind Speed`, `Days of planted`, `pH`.
- **What this dataset does NOT contain, confirmed by inspecting every
  column:** no timestamp/date/time-of-day field, no farm/field/device
  identifier, no irrigation on/off signal, no valve state, no water
  volume, no pump duration. It is a single continuous greenhouse tomato
  trial recorded as a sequence ordered by whole days since planting
  (`Days of planted`, 28 distinct values from 1 to 130), not by clock
  time.

This is the dataset actually trained on. The 5 manually inserted
MongoDB Atlas telemetry readings were **not used** — they remain
development/demo data only, and are structurally prevented from ever
being certified as "real training data" by `MIN_REAL_EXAMPLES = 500` in
`ai/training/train.js` (5 ≪ 500). No synthetic-dev data was used in
training or evaluation for this workstream; the only place
synthetic-dev data is used anywhere in this codebase is workstream 1's
own irrigation-need model (a fully separate model/target), which this
work does not touch.

## 2. EXTERNAL DATA infrastructure reused vs. newly built

Reused unchanged from workstream 2: `ai/external/adapters/csvUtil.js`
(CSV parsing), `ai/external/schemas/provenance.schema.js` (provenance
metadata contract), `ai/external/leakage/leakageGuards.js`
(`assertNoOverlapBetweenSplits`, `LeakageError`).

Deliberately NOT reused, with reasons:
- `ai/external/schemas/canonicalRecord.schema.js` requires a real
  `timestamp` (`z.coerce.date()`, not nullable). This dataset has no
  timestamp. Forcing one in would mean fabricating a value the source
  does not provide — instead, a dedicated
  `ai/external/schemas/tomatoObservation.schema.js` was written that
  represents the data as it actually is (ordinal `daysSincePlanting`,
  not a calendar date).
- `ai/external/adapters/genericIotCsvAdapter.js` / `canonicalBridge.js`
  assume a per-device time-series shape with an irrigation on/off
  signal, used to build lag/rolling-window features
  (`ai/features/featureEngineering.js`). None of that exists in this
  file, so a new adapter
  (`ai/external/adapters/tomatoIrrigationCsvAdapter.js`) and a new,
  separate feature/training pipeline (`ai/training/tomato/`) were
  built instead of stretching the existing time-series-oriented code
  to fit. This keeps the two entirely separate model families
  (AgriSmart's own irrigation-need forecaster vs. this dataset's
  concurrent soil-moisture estimator) from being confused with each
  other.

New files this phase added, all under `agrismart-backend/`:
`ai/external/schemas/tomatoObservation.schema.js`,
`ai/external/adapters/tomatoIrrigationCsvAdapter.js`,
`ai/external/quality/tabularQualityEngine.js`,
`ai/training/tomato/{featureVersion,features,splitByPlantingDay,
linearRegression,baseline,outOfDistribution,train}.js`,
`ai/evaluation/regressionMetrics.js`,
`ai/schemas/regressionPrediction.schema.js`,
`ai/inference/predictTomatoSoilMoisture.js`, plus tests under
`tests/ai/tomato/` and a new advisory-only API route (Section 9).

## 3. SYNTHETIC_DEV DATA — explicitly not used here

No synthetic-dev data (`ai/data/syntheticDevData.js`) was generated,
loaded, or blended into any step of this workstream. It is mentioned
only for completeness/contrast, per the standing rule that
`dataSource` must never be blurred between real, external, and
synthetic-dev.

## 4. Data-quality findings (run against the real, deduplicated data)

Via `ai/external/quality/tabularQualityEngine.js`, executed on all
2,972 deduplicated real rows:

- **28 exact-duplicate rows** found in the 3,000-row source file
  (identical values across every column). These were dropped before
  splitting/training (2,972 rows used) — kept in the raw file
  unmodified (`ai/external/adapters/pending/tomato_irrigation_dataset.csv`
  is the byte-for-byte original), but excluded from the training set
  because an exact duplicate is redundant signal that could otherwise
  double-weight one observation.
- **846 of 3,000 rows (28.2%) have a `pH` value outside the
  agronomically plausible soil range [3.5, 9.5]** (observed dataset
  range is 0.91–12.26). This was **flagged, not silently dropped or
  clamped** — pH is chemically valid on the 0–14 scale even where it
  is agronomically implausible for soil, and this project does not
  invent a "corrected" value. This is treated as a real, reportable
  data-quality limitation of the source file (Section 11).
- **No column is entirely missing or has a high missing-value rate** —
  0 nulls in any of the 14 original columns.
- **No constant column** — every numeric field has more than one
  distinct value.
- **Evapotranspiration-formula consistency check:** the standard
  FAO-56 relationship `ETc = Kc × ET0` holds exactly (within 0.01) for
  only **7.9% of rows (236/3,000)**. This is reported both ways: it is
  NOT consistently a deterministic function of the other two columns
  (so it isn't pure derived-leakage in the classic sense), but it also
  doesn't match the textbook formula in the vast majority of rows,
  which means the units/derivation of `Reference evapotranspiration`
  and `Evapotranspiration` in this file could not be independently
  verified against the standard agronomic formula. Their absolute
  magnitudes (observed up to ~1,100) are also far outside the normal
  0–12 mm/day range for daily ET0/ETc, reinforcing that these two
  columns' units are unconfirmed. Documented as a limitation
  (Section 11), and this uncertainty is exactly why Evapotranspiration
  was ruled out as a candidate prediction target (Section 5).
- **Crop-stage / day-count ranges overlap** (e.g. "Mid stage" spans
  days 45–110 and "Last stage" spans days 62–130) — informational, not
  an error; it means crop stage carries some but not fully redundant
  information relative to the day count.

No ERROR/CRITICAL findings were produced; the pipeline's own abort
condition (`ai/training/tomato/train.js` throws on any ERROR/CRITICAL
finding) did not trigger.

## 5. Target selection — what was ruled out, and why

Per instruction: no irrigation decision/valve label exists in this
file, so none was invented. Concretely ruled out:

- **Irrigation on/off or duration prediction** — no such column exists
  anywhere in the source data. Not attempted.
- **Evapotranspiration (ET) as a regression target** — ruled out
  because (a) its relationship to two other feature columns
  (`Kc × ET0`) is unverified/inconsistent (Section 4), making any
  strong model performance here hard to interpret as a genuinely
  learned skill rather than a partial rediscovery of a formula with
  unclear provenance, and (b) its real-world unit could not be
  confirmed.
- **Forecasting anything "N hours/days ahead"** — not supportable.
  The only temporal signal in this file is `Days of planted`, a whole
  **day** count with no time-of-day resolution and multiple readings
  per day in no stated order within a day. There is no way to define a
  leak-free "future" window at sub-day resolution, so this dataset
  cannot support a forecasting task analogous to AgriSmart's own
  `irrigation_need_next_3h` model.

**Target actually chosen: `soilMoistureRaw`, estimated concurrently**
(i.e., "given these other measurements taken at the same time, what is
the soil-moisture reading?"). This is a **virtual-sensor / sensor-fusion
regression task**, not a forecast — a legitimate, real use for
agricultural ML (e.g., estimating soil moisture when that specific
sensor is unavailable or being cross-checked against other readings).
It is the strongest defensible task the actual columns support, and it
is explicitly and permanently distinguished in code and naming
(`tomato_soil_moisture_estimate`) from AgriSmart's own forward-looking
`irrigation_need_next_3h` classifier — they are different models, on
different data, answering different questions, and must never be
conflated.

**Important caveat on the target's own unit:** the source file does
not state the unit of `Soil moisture` (observed range 120.09–699.99 —
not a 0–100% scale). It is retained and modeled as `soilMoistureRaw`
in unspecified raw sensor units, never coerced into an assumed
percentage.

## 6. Features vs. descriptive/derived variables (explicit distinction)

**Prediction target (1):** `soilMoistureRaw`.

**Features used (16, after encoding — `ai/training/tomato/featureVersion.js`):**
`airTemperatureCelsius`, `relativeHumidityPercent`,
`referenceEvapotranspiration`, `evapotranspiration`, `cropCoefficient`,
`soilNitrogenMgPerKg`, `soilPhosphorusMgPerKg`, `soilPotassiumMgPerKg`,
`solarRadiationWPerM2`, `windSpeedMPerS`, `daysSincePlanting`,
`soilPh` (12 numeric features), plus a 4-column one-hot encoding of
`cropStage` (`Initial Stage` / `Development Stage` / `Mid stage` /
`Last stage`).

**Descriptive/context variables, not used as model inputs:**
`rowIndex` (source-file position, used only for duplicate/order
auditing), `trialId` (a constant — this file is one single trial, not
a multi-site dataset, so it carries no discriminative information and
exists only so the leakage-guard helpers have an "entity" key to group
on).

**Derived variables:** none were engineered beyond the one-hot
encoding of the existing `Crop Coefficient stage` column — no
lag/rolling/window features were computed, because (Section 5) there
is no sub-day timestamp to compute them from. This is a **concurrent**
regression, explicitly not a time-series forecast.

## 7. Preprocessing

- Column headers trimmed of stray whitespace (the raw header includes
  a literal trailing space after `Temperature [_ C]`).
- All 14 source columns coerced from string to `Number` on ingestion;
  every row parsed successfully (0 rejected — see adapter test
  `tests/ai/tomato/adapter.test.js`).
- 28 exact-duplicate rows dropped before splitting (Section 4).
- Missing-value imputation: mean-imputation infrastructure is present
  (mirroring `ai/training/logisticRegression.js`'s design) but this
  dataset has zero missing values, so it was a no-op in practice; kept
  for robustness against a future re-run with a dirtier file.
- Standardization (zero mean, unit variance) fit **only on the TRAIN
  split**, then applied unchanged to validation/test — never fit on
  data the model shouldn't have seen yet.

## 8. Split strategy and leakage analysis

**Why not a plain chronological row-fraction slice
(`ai/training/splitChronological.js`):** many rows share the same
`daysSincePlanting` value — one single day (100) alone accounts for
659 of the 3,000 rows. A naive index-fraction cut can fall in the
middle of one day's block, putting near-identical same-day readings on
both sides of the train/test boundary. That is a real leakage risk
(same-day rows are highly correlated), not a cosmetic one, so a new
**group-aware chronological split** was written
(`ai/training/tomato/splitByPlantingDay.js`): split points are chosen
at day **boundaries** closest to the requested 70/15/15 fractions, so
every row for a given day lands entirely in one split.

**Actual split produced on this run:**
- Train: 2,474 rows, `daysSincePlanting` ≤ 100
- Validation: 198 rows, 100 < `daysSincePlanting` ≤ 105
- Test: 300 rows, `daysSincePlanting` > 105

**Leakage guard:** `ai/external/leakage/leakageGuards.js`'s
`assertNoOverlapBetweenSplits` was run on every split pair
(train/validation, validation/test, train/test), using
`daysSincePlanting` as the ordering key and the constant `trialId` as
the entity key, with `requireChronological: true`. It passed on all
three pairs — no day value is shared across any two splits, and each
split's day range is strictly before the next. `tests/ai/tomato/
qualityAndSplit.test.js` additionally asserts this function correctly
**throws** `LeakageError` on a deliberately broken (non-grouped) split,
so the guard is proven to actually catch the failure mode it exists
for, not just pass trivially.

**Documented limitation of this split:** with only 28 unique day
values and a single continuous trial, the test set represents the
**last ~5 growth days of one specific trial** — a fairly narrow slice
of the crop's life cycle (late "Last stage" growth). Generalization
claims beyond that specific late-season window, or to a different
trial/greenhouse/season/location, are not supported by this evaluation
and are not made in this report.

## 9. Models trained and how they were selected

**Baselines (must be beaten before any ML claim is made):**
- Mean baseline: predicts the train split's mean `soilMoistureRaw` for
  every row.
- Stage-mean baseline: predicts the train split's mean
  `soilMoistureRaw` **within the same crop stage** (falls back to the
  global mean for an unseen stage).

**Model:** a small, dependency-free ridge (L2-regularized) linear
regression trained by batch gradient descent
(`ai/training/tomato/linearRegression.js`), directly mirroring the
design of `ai/training/logisticRegression.js` (spec: "do not train a
deep model just because it sounds advanced" — 2,474 training rows and
16 features do not justify anything heavier, and a from-scratch
implementation keeps the pipeline auditable with no new npm
dependency). Four L2 values (0.001, 0.01, 0.1, 1) were trained on the
train split; the one with the best R² on the **validation** split
(never test) was selected — `l2 = 1` won validation with R² = -0.013
(all four candidates had negative validation R², i.e. none beat
predicting the mean even on validation).

**Registered via the existing model lifecycle**
(`ai/models/modelRegistry.js`, unchanged): saved under target
`tomato_soil_moisture_estimate` as `status: "candidate"` — the
registry's non-negotiable default, exactly as for every other model in
this project. It is never promoted directly to `active`.

## 10. Evaluation (test split, n = 300) — reported exactly as measured

| Predictor | MAE | RMSE | R² |
|---|---|---|---|
| Mean baseline | 138.77 | 161.48 | -0.0044 |
| Stage-mean baseline | 140.44 | 164.17 | -0.0382 |
| **Ridge linear regression (l2=1)** | **138.99** | **162.18** | **-0.0132** |

**Validation criteria** (defined in `ai/training/tomato/train.js`
before training, not adjusted after seeing the result):
`beatsMeanBaseline AND beatsStageMeanBaseline AND R² > 0`.

- `beatsMeanBaseline`: **false** (the model's test R² of -0.013 is
  worse than the mean baseline's -0.004 — the model is very slightly
  worse than just always predicting the training mean).
- `beatsStageMeanBaseline`: **true** (it did edge out the weaker
  stage-mean baseline).
- `positiveR2`: **false**.
- **Overall: criteria NOT met.** The model was **not** promoted beyond
  `candidate`. `promoteModel()` was never called for this run.

**Diagnostic (not part of the official evaluation, and not used for
any registered model or claim):** the same model/features were also
tried under a random (IID) shuffle-split as a sanity check on whether
the weak result was an artifact of the strict day-based generalization
requirement. Result: R² = 0.029 on that random split — still barely
above zero and only marginally better than that split's own mean
baseline (R² = -0.001). This indicates the weak result is **not**
primarily an artifact of the chronological split being "too hard"; the
linear relationship between these particular 16 features and
`soilMoistureRaw` is fundamentally weak in this dataset, consistent
with the low single-feature Pearson correlations observed during
audit (all 12 numeric features individually correlate with
`soilMoistureRaw` at |r| ≤ 0.17).

**Conclusion: this experiment did not produce a validated,
production-usable model.** That is reported here as the actual,
honest outcome — not reframed as a partial success.

## 11. Limitations

- **Weak/no linear predictive signal found.** Soil moisture in this
  dataset is not well explained by the other 12 measured variables
  under a linear model, on a leak-free chronological holdout. This
  could reflect a genuinely weak relationship, a non-linear
  relationship a linear model cannot capture, unmeasured confounders
  (e.g. actual irrigation timing/volume, which this file does not
  record at all), or sensor noise in `Soil moisture` itself. This
  report does not claim to know which.
- **Only one trial, one location, one growing season.** 28 unique
  days from a single greenhouse trial. No cross-trial, cross-season,
  or cross-location generalization can be claimed.
- **Units are partially unconfirmed.** `Soil moisture`,
  `Reference evapotranspiration`, `Evapotranspiration`, `Potassium`,
  and `Wind Speed` are not explicitly labeled with units in the
  source header; units in `provenance.originalUnits` for those fields
  are inferred/flagged as unconfirmed, not asserted as fact.
  `Reference evapotranspiration`/`Evapotranspiration` values (up to
  ~1,100) do not match standard mm/day magnitudes.
- **28.2% of rows have an agronomically implausible pH** — retained
  and flagged, not corrected, meaning this feature is noisier than it
  first appears.
- **License is unconfirmed.** Do not redistribute this dataset or a
  derivative of it commercially until the Mendeley license is directly
  confirmed.
- **AgriSmart's real IoT telemetry cannot feed this model
  automatically.** `src/modules/telemetry/telemetry.model.js` shows
  AgriSmart's actual live sensors report only `soilMoisturePercent`,
  `soilSalinityPpt`, and `temperatureCelsius` — none of NPK, pH, solar
  radiation, wind speed, days-since-planting, or crop-growth-stage,
  which this model needs as inputs, are currently collected by
  AgriSmart's devices. The new endpoint (Section 12) therefore accepts
  a manually supplied observation; it is a research/what-if tool, not
  an automatic per-device insight like the existing
  `/recommendations/:valveId` endpoint.

## 12. What was integrated into AgriSmart, and the safety boundary

**New, advisory-only, read-only endpoint:**
`POST /api/v1/ai/soil-moisture-estimate` (authenticated, request body
validated by zod, `.strict()` — unknown fields rejected). It:

1. Loads the latest registered model for
   `tomato_soil_moisture_estimate` via the existing
   `ai/models/modelRegistry.js` (unchanged).
2. **Refuses to serve a prediction unless that model's status is
   `"validated"` or `"active"`.** Today that model is `"candidate"`
   (Section 10), so this endpoint currently always returns
   `available: false` with an explicit `reason` string naming why
   (`tests/ai/tomato/inferenceAndSafety.test.js` asserts this directly
   against the real registered model, not a mock).
3. Performs out-of-distribution checking against the training feature
   ranges (`ai/training/tomato/outOfDistribution.js`) for when/if a
   future retrain does validate.
4. **Never imports or calls `commandsService` or
   `irrigationService`'s `openValve`/`closeValve`.** This is enforced
   by a source-scanning test
   (`tests/ai/tomato/inferenceAndSafety.test.js`), the same pattern
   used for the workstream-1 model's safety boundary
   (`tests/ai/safetyBoundary.test.js`), applied here to both
   `ai/inference/predictTomatoSoilMoisture.js` and the new controller
   function's own body.

This preserves the same hybrid safety architecture already in place:
AI recommendation → (rules/safety layer, unchanged) → command →
device → verification. Nothing added in this workstream shortens or
bypasses that chain, and nothing here can currently reach a valve even
in principle — it doesn't return anything actionable, and even its
prediction path is currently disabled by its own validation gate.

## 13. Tests added and full suite result

New: `tests/ai/tomato/adapter.test.js`,
`tests/ai/tomato/qualityAndSplit.test.js`,
`tests/ai/tomato/regressionMetrics.test.js`,
`tests/ai/tomato/inferenceAndSafety.test.js` — covering: real-file
row/column/duplicate counts, schema validation of every real record,
rejection (not fabrication) of a malformed synthetic row, quality-check
findings (empty/implausible/constant-column/duplicate detection),
group-split integrity (no day split across train/val/test),
`assertNoOverlapBetweenSplits` both passing on a correct grouped split
and throwing `LeakageError` on a deliberately broken one, regression
metrics correctness (including that a worse-than-mean predictor
produces a negative R², not a clipped/hidden one), the model-registry
lifecycle for this target, and the safety-boundary source scan.

Full AI test suite (`tests/ai`, including this workstream and both
prior ones): **20 suites, 90 tests, all passing.** Lint
(`eslint ai scripts/ai src/modules/ai tests/ai src/routes/index.js
--max-warnings=0`): **0 errors, 0 warnings.**

## 14. Production readiness: **research-only, NOT production-ready**

Explicitly, and for two independent reasons:

1. **The model itself did not validate** (Section 10) — it does not
   beat a trivial baseline on held-out data, and the pipeline's own
   validation gate (which this report did not relax to force a
   different outcome) keeps it at `status: "candidate"`, unservable by
   the API.
2. **Even a model that did validate on this dataset could not be
   deployed operationally against AgriSmart's real devices today**,
   because AgriSmart's actual telemetry schema does not collect most
   of this model's required inputs (Section 11). Closing that gap
   would require either new sensors (NPK, pH, solar radiation, wind
   speed) or a materially different, AgriSmart-native dataset.

**What would change this assessment:** a real AgriSmart-native dataset
that (a) actually contains an irrigation decision or valve/pump signal
paired with the same sensors AgriSmart's own devices already collect
(soil moisture, soil salinity, temperature), and (b) has genuine
clock-time granularity fine enough to support the forecasting task
workstream 1 already scaffolded (`irrigation_need_next_3h`). This
Mendeley dataset does not offer either of those two things; it was
still worth the exercise because it proved out the full real-data
ingestion → quality → leakage → split → train → baseline → registry →
advisory-inference pipeline end to end against a genuine external
file, which is directly reusable once a better-fitting dataset is
available.

## 15. Environment constraints encountered (for reproducibility)

Neither this session's isolated device shell nor its cloud container
could reach `data.mendeley.com` or MongoDB Atlas directly (DNS/TCP
egress restrictions probed and documented during this phase). The
dataset was therefore obtained by the user downloading it manually
from the Mendeley page and attaching it to the chat, then copied
byte-for-byte (SHA-256 verified) into this repository. This is
recorded here so a future re-run of `npm run ai:tomato:train` is known
to depend on that file already being present at
`ai/external/adapters/pending/tomato_irrigation_dataset.csv`, rather
than being fetched automatically by any script in this repository.

## 16. How to reproduce

```
npm run ai:tomato:train
```

runs `ai/training/tomato/train.js` against the committed real file, end
to end (ingest → dedupe → quality checks → group-aware split → leakage
assertions → baselines → ridge regression with L2 selection on
validation → test evaluation → model-registry save, promoting only if
validation criteria are met). All numbers in Sections 4, 8, and 10 of
this report came directly from that command's output, not from a
separate manual calculation.

---

# Dataset #2 — Evolving Tomato Cultivation Testbed (`irrigation_event_next_1h`)

Status date: 2026-09-11. This section is APPENDED to the report above
without altering it — Dataset #1's result (R² = -0.013, `candidate`,
unpromoted) stands exactly as originally documented.

## 0. One-paragraph summary (read this first)

A second real, user-attached dataset — the "IoT Dataset from an
Evolving Tomato Cultivation Testbed" (2023/2024/2025 seasons, real
per-line valve-actuation ground truth) — was ingested and used to
train a binary classifier predicting whether a NEW irrigation event
will START within the next hour (`irrigation_event_next_1h`). Unlike
Dataset #1, this dataset has genuine irrigation-decision ground truth,
making this the first target in the project with a defensible
irrigation-relevant label. After fixing two real data-quality defects
(off-season data pollution; a handful of physically impossible sensor
values — see `AI_DATA_QUALITY_REPORT.md`), the model was trained on
the full 2024 season (chronological 70/15/15 split), evaluated on the
2024 test tail, and evaluated again — with NO retraining — on the
entire, fully external 2025 season. **The model did not meet this
project's own (stricter, dual-condition) validation criteria on
either evaluation.** It is saved as `status: "candidate"` and the
inference endpoint refuses to serve it. Section 6 explains why
(seasonal non-stationarity + a genuinely hard onset-prediction task),
based on direct empirical investigation, not guesswork.

## 1. REAL DATA — dataset actually used

- **Name:** IoT Dataset from an Evolving Tomato Cultivation Testbed
- **Site:** University of Parma IoT Laboratory / Azienda Sperimentale
  Stuard, Italy (44.8°N, 10.27°E)
- **Seasons ingested:** 2024 (primary training + in-season test), 2025
  (fully external validation). 2023 inventoried but not used as a
  modeling season — see `AI_DATASET_INVENTORY.md` (non-independence
  with STUARD).
- **DOI:** unconfirmed for this specific multi-year bundle (recorded
  as `null`, not guessed — see `AI_DATASET_INVENTORY.md`). Related
  companion single-season publication: Belli et al., *Data in Brief*
  60 (2025) 111521, DOI `10.1016/j.dib.2025.111521`.
- **Files ingested:** `soil20XX.csv` + `valve_controller20XX.csv` per
  season, committed to
  `ai/external/adapters/pending/evolving-tomato-testbed/{2023,2024,2025}/`.
- **How it entered this project:** user-attached zip, staged from the
  user's device into the cloud container, unzipped and inspected, then
  the relevant CSVs staged back into the actual repository on the
  user's device with SHA-256 verification on both sides.

## 2. Real row counts (2024 season, as loaded by the adapter)
`totalRowsInFile` (soil + valve rows combined) → after excluding
53,187 soil rows outside the valve stream's own observed window and
rejecting 3 implausible soil-moisture readings → **192,716 accepted
canonical records**, 297 rejected total. See `AI_DATA_QUALITY_REPORT.md`
for the full defect narrative and `AI_DATASET_INVENTORY.md` for the
per-dataset summary table.

## 3. Target chosen and why (rule 12)
`irrigation_event_next_1h`: will a NEW irrigation event START within
the next hour, computed from REAL observed valve-open transitions
(`ai/features/irrigationEventLabel.js`), gated on
`observedThroughMs` so "no event" (false) is never confused with
"insufficiently observed" (null, excluded from training). This is
deliberately an ONSET label (a new event starting), not a persistence
label (valve open at any point in the window) — see
`AI_DATA_QUALITY_REPORT.md` §"Non-bug investigation" for why that
distinction matters and how it was confirmed empirically. See
`AI_TARGET_CATALOG.md` for every target considered and rejected.

## 4. Split protocol
See `AI_SPLIT_PROTOCOL.md` for full detail: chronological 70/15/15 on
2024 for train/val/test; entire 2025 season used as a fully external,
no-retrain validation set.

## 5. Model, baseline, and real metrics (from the actual saved model artifact, `ai/models/artifacts/irrigation_event_next_1h.latest.json`, version 2)

| Evaluation | n | ROC-AUC | Average precision | Base rate |
|---|---|---|---|---|
| 2024 in-season test | 3,216 | 0.2619 | 0.0015 | 0.01433 |
| 2024 test, ablated (no irrigation-history features) | 3,216 | 0.733 | 0.0039 | 0.01433 |
| 2025 external season (no retraining) | 31,137 | 0.3133 | 0.0041 | 0.00610 |

Model: logistic regression, L2 selected from `{0.001, 0.01, 0.1, 1}`
by validation average precision (selected L2 = 1, 300 epochs, learning
rate 0.3). Confusion matrices at the default 0.5 threshold show the
model predicting the negative class almost everywhere (tp=0 on every
evaluated slice above) — consistent with a rare-event target the model
has not learned to discriminate, not a labeling bug (see
`tests/ai/evolvingTomato/irrigationEventLabel.test.js` for direct unit
proof the label function itself is correct on small fixtures).

## 6. Why it failed validation — investigated, not guessed
Both a genuine seasonal non-stationarity in irrigation-onset frequency
across the 2024 season, and a fundamentally harder task definition
(onset vs. persistence) versus an earlier Python feasibility
prototype, were identified as the cause via direct empirical
investigation (event-object inspection, week-by-week label-rate
breakdown, multi-horizon re-runs). Full narrative in
`AI_DATA_QUALITY_REPORT.md`. This is reported as the honest scientific
conclusion, not chased further with split/horizon tweaks aimed only at
producing a passing number.

## 7. Validation gate and outcome
Dual-condition gate (`averagePrecision > 3× base rate` AND `rocAuc >
0.75`, required on BOTH the 2024 test AND the 2025 external season) —
**both conditions FAILED on both evaluations.** Model remains
`status: "candidate"`; `promoteModel` was never called for it in the
actual training run. The inference wrapper
(`ai/inference/predictIrrigationEventLikelihood.js`) checks status and
refuses to serve any prediction while it remains `candidate`,
returning `available: false` with an explicit, human-readable reason —
verified directly by
`tests/ai/evolvingTomato/inferenceAndSafety.test.js`.

## 8. API wiring (advisory-only, read-only)
`GET /api/v1/ai/irrigation-event-likelihood/:valveId` — added to
`src/modules/ai/ai.controller.js` / `ai.routes.js`, reusing the exact
same ownership-checked `loadValve` middleware and
telemetry/irrigation-history query pattern as the existing
`getRecommendation` endpoint. Currently returns `available: false`
given the model's `candidate` status; will begin serving automatically,
with no further code changes, the moment (if ever) a future retraining
run produces a model that clears the validation gate above.

## 9. Ablation summary
See `AI_ABLATION_REPORT.md` for the full Node-onset-label ablation
(irrigation-history features on/off) and the SEPARATE Python
persistence-label ablation (AgriSmart-compatible feature subset vs.
full feature set) — the two answer different questions and are not
conflated.

## 10. Test and lint status
`tests/ai` (24 suites / 118 tests, includes 4 new suites under
`tests/ai/evolvingTomato/`): **PASS.**
`eslint ai scripts/ai src/modules/ai tests/ai src/routes/index.js
--max-warnings=0`: **PASS (clean).**
See `AI_ARCHITECTURE_AUDIT.md` §4 for the full run record, including
the pre-existing, unrelated `tests/api/auth.test.js` failures under the
no-database diagnostic config (out of scope for this workstream).

## 11. Reproduction
```
npm run ai:evolvingTomato:train
```
runs `ai/training/evolvingTomato/train.js` end to end against the
committed real files (ingest both seasons → restrict to valve-observed
window → reject implausible values → bridge to per-zone
telemetry/irrigation history → build stride-sampled labeled examples →
chronological split on 2024 → base-rate baseline → logistic-regression
L2 search on validation → 2024 test evaluation → ablation → 2025
external evaluation → dual-condition validation gate → model-registry
save). All numbers in Sections 5 and 7 came directly from that
command's actual output (the saved artifact file), not a separate
manual calculation.

## 12. Honest bottom line for Dataset #2
Two real datasets have now been fully, honestly evaluated in this
project. Neither produced a validated model. This is reported as the
correct scientific outcome of this phase, not a failure to be hidden:
see `AI_MODEL_CARD.md` for the consolidated, current state of every
model in the registry, and
`AGRISMART_REAL_DATA_COLLECTION_PLAN.md` for what real AgriSmart
telemetry would materially change this picture.

---

# Dataset #3 — Arnesano Precision-Irrigation Dataset (`arnesano_soil_moisture_24h_forecast`)

Status date: 2026-09-11. Appended without altering Datasets #1/#2's
sections above.

## 0. One-paragraph summary

A third real dataset — the Arnesano, Italy multi-sector precision-
irrigation field trial (5 sectors, 4 crop types, Feb-Sep 2025) — was
used to train a 24-hour-ahead soil-moisture forecasting model. This
project's own forensic audit found the dataset's OWN published
"24-hour" target column is frequently not actually 24 hours ahead
(AI_DATA_QUALITY_REPORT.md Finding 1), so the target was rebuilt
directly from the gap-preserving merged layer using an exact,
unit-tested wall-clock 24h lookup. Trained on zones 1/2/4 (open-field
tomato x2, zucchini) with a chronological 70/15/15 split, the model
narrowly beats both a mean baseline and a very strong persistence
baseline (R^2=0.9927 vs. 0.9923) in-distribution. Evaluated with NO
retraining on zone 5 (blueberry, a held-out crop), the SAME model
FAILS to beat the persistence baseline (R^2=0.8765 vs. 0.8807). It is
saved as `status: "candidate"` and the inference endpoint refuses to
serve it. Zone 3 (potted tomato) was excluded from every role due to
severe, independently-verified sensor-quality problems.

## 1. Real data used
Arnesano, Apulia, Italy, 2025 season. Zones 1, 2, 4 = primary training
(pooled, 22,722 leak-free examples after quality filtering). Zone 5 =
cross-crop validation (9,444 examples, no retraining). Zone 3 =
rejected. Files: `ai/external/adapters/pending/arnesano/merged/dataset_zone_{1,2,4,5}.csv`
(zone 3's file was NOT committed to the repository, since it holds no
role). See AI_DATASET_INVENTORY.md for full forensics.

## 2. Target and why
`arnesano_soil_moisture_24h_forecast`: soil moisture 24 real hours
ahead, rebuilt from the merged layer (see AI_SPLIT_PROTOCOL.md) rather
than trusting the dataset's own published target column. Selected
over every other candidate target in AI_TARGET_CATALOG.md's final
comparison table because it is the only one that is both leak-free-
by-construction (unit-tested) and evaluable against a genuinely
difficult, real baseline.

## 3. Model, baselines, and real metrics (from the actual saved model artifact)

| Evaluation | n | MAE | RMSE | R^2 |
|---|---|---|---|---|
| Test (zones 1/2/4, mean baseline) | 3,409 | 20.68 | 21.75 | -0.096 |
| Test (zones 1/2/4, persistence baseline) | 3,409 | 0.478 | 1.818 | 0.9923 |
| Test (zones 1/2/4, trained model) | 3,409 | 0.637 | 1.776 | **0.9927** |
| Zone 5 cross-crop (mean baseline) | 9,444 | 30.35 | 32.61 | -0.098 |
| Zone 5 cross-crop (persistence baseline) | 9,444 | 5.97 | 10.75 | **0.8808** |
| Zone 5 cross-crop (trained model, NO retraining) | 9,444 | 6.88 | 10.93 | 0.8765 |

Model: ridge linear regression, L2=0.001, 500 epochs, learning rate
0.05, selected from `{0.001, 0.01, 0.1, 1}` by validation R^2.

## 4. Why the in-distribution win doesn't survive cross-crop validation
The model's edge over persistence in-distribution (R^2 0.9927 vs.
0.9923 — a small but real, consistently-observed improvement, MAE
0.637 vs. 0.478 the other way, RMSE 1.776 vs. 1.818 in the model's
favor) evidently reflects patterns specific to zones 1/2/4's own
crops/soil/irrigation regime, not a universal weather-to-soil-moisture
relationship — on zone 5 (a genuinely different crop, blueberry, with
its own distinct irrigation thresholds and substrate), the model's
MAE (6.88) is WORSE than simply assuming tomorrow looks like today
(5.97). 2,808 of zone 5's 9,444 examples (30%) have at least one
feature outside the zones-1/2/4 training range, which plausibly
contributes to but does not fully explain the gap (persistence itself,
which uses no trained parameters at all, still outperforms the model
even accounting for this).

## 5. Validation gate and outcome
Gate: model must beat BOTH mean and persistence baselines with
positive R^2, on BOTH the pooled test split AND the zone-5 cross-crop
validation. Result: passes on test, FAILS on zone 5 (does not beat
persistence). `meetsValidationCriteria: false`. Model remains
`candidate`; `promoteModel` was never called. Inference
(`ai/inference/predictArnesanoSoilMoisture24h.js`) refuses to serve
any prediction while `candidate`, verified by
`tests/ai/arnesano/inferenceAndSafety.test.js`.

## 6. API wiring
`POST /api/v1/ai/arnesano-soil-moisture-forecast` — manual-observation
research endpoint, mirroring `postSoilMoistureEstimate`'s pattern
(this model's feature set is not AgriSmart's live telemetry shape).
Currently refuses to serve, given `candidate` status.

## 7. Ablation
See AI_ABLATION_REPORT.md: irrigation features (current-bin duration,
backward 4h water volume) add essentially no measurable signal beyond
weather + current soil state in this formulation (0.9927 vs. 0.9927 —
within noise).

## 8. Test and lint status
`tests/ai` (27 suites / 139 tests, includes 3 new suites under
`tests/ai/arnesano/`): **PASS.** `eslint ai scripts/ai src/modules/ai
tests/ai src/routes/index.js --max-warnings=0`: **PASS.**

## 9. Reproduction
```
npm run ai:arnesano:train
```
runs `ai/training/arnesano/train.js` end to end against the committed
real merged-layer CSVs. All numbers above came directly from that
command's actual output / the saved model artifact.

## 10. Honest bottom line
This is the closest any of the three real datasets modeled in this
project has come to a validated model — the in-distribution result is
genuinely a small, real improvement over an already-very-strong
baseline. But it still fails this project's own cross-generalization
bar, and is reported as a `candidate`, not a success. Three real
datasets, three trained models, zero promotions — see AI_MODEL_CARD.md
for the consolidated picture.
