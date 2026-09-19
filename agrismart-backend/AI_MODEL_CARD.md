# AI Model Card — Consolidated Registry State

Status date: 2026-09-11. Every model this project has ever registered.
Both are currently `candidate` (unpromoted); **zero models are
`validated` or `active`.** This is reported plainly, not obscured.

## Model 1 — `tomato_soil_moisture_estimate`
- **What it predicts:** current soil-moisture reading, from concurrent
  environmental/agronomic measurements (air temp, humidity,
  evapotranspiration, crop coefficient, soil NPK, solar radiation,
  wind speed, days-since-planting, crop growth stage, soil pH).
- **Trained on:** Mendeley "Dataset on irrigation for Tomato" (real,
  external, 3,000 rows, DOI `10.17632/33cngpcrmx.2`).
- **Model type:** ridge linear regression.
- **Status:** `candidate` — **not served.** Test R² = -0.013 (worse
  than predicting the mean).
- **Why it exists despite failing:** documents a genuine, defensible
  attempt at the strongest target this dataset supports, and the exact
  reason it fails (feature set doesn't include the soil-moisture-
  specific signal needed — see original `AI_TRAINING_REPORT.md`
  Sections 8-10).
- **Served via:** `POST /api/v1/ai/soil-moisture-estimate` — refuses
  (`available: false`) given `candidate` status.
- **Real-world use:** none currently. Advisory-only if ever promoted;
  never actuates a valve.

## Model 2 — `irrigation_event_next_1h`
- **What it predicts:** probability that a NEW irrigation event will
  START within the next hour, from the same feature set AgriSmart's
  own live telemetry + irrigation-event log already computes
  (`soilMoisturePercent`, `temperatureCelsius`, `soilSalinityPpt`,
  `hoursSinceLastIrrigation`, `irrigationMinutesLast6h/24h`, `hourOfDay`,
  `dayOfWeek`).
- **Trained on:** IoT Dataset from an Evolving Tomato Cultivation
  Testbed, real external valve-actuation ground truth, 2024 season
  (192,716 accepted canonical records after quality filtering);
  validated against the fully external 2025 season.
- **Model type:** logistic regression, L2 = 1.
- **Status:** `candidate` — **not served.** 2024 test ROC-AUC 0.2619,
  average precision 0.0015 (base rate 0.01433); 2025 external ROC-AUC
  0.3133, average precision 0.0041 (base rate 0.00610). Both below the
  project's dual-condition validation gate (ROC-AUC > 0.75 AND avg.
  precision > 3× base rate, on both evaluations).
- **Why it exists despite failing:** first target in the project with
  genuine irrigation-decision ground truth; the failure itself is
  informative (see `AI_DATA_QUALITY_REPORT.md`'s seasonal-
  non-stationarity + onset-vs-persistence investigation) and directly
  motivates the real-data collection plan below.
- **Served via:** `GET /api/v1/ai/irrigation-event-likelihood/:valveId`
  — refuses (`available: false`) given `candidate` status; wired now
  so it begins serving automatically, with no further code changes,
  the moment a future retraining run clears the gate.
- **Site-mismatch caveat (structural, not just documentation):** every
  successful response this endpoint would ever produce is required
  (by code, see `predictIrrigationEventLikelihood.js`) to append an
  explanation noting the model was trained on a different physical
  site (a research testbed in Italy, not any AgriSmart farm) and
  should be read as a reference signal, never a site-specific
  recommendation.

## Model 3 — `arnesano_soil_moisture_24h_forecast`
- **What it predicts:** soil moisture 24 real hours ahead, from
  concurrent weather (ERA5), on-site EC/pH, current soil moisture, and
  backward-looking applied-water volume.
- **Trained on:** Arnesano precision-irrigation field trial (real,
  external), zones 1/2/4 (22,722 examples); cross-crop validated on
  zone 5 (blueberry, 9,444 examples, no retraining).
- **Model type:** ridge linear regression, L2=0.001.
- **Status:** `candidate` — **not served.** Beats both baselines
  in-distribution (R^2 0.9927 vs. persistence 0.9923) but LOSES to the
  persistence baseline on the held-out crop (R^2 0.8765 vs. 0.8808).
- **Why it exists despite failing:** the closest this project has come
  to a validated model — informative specifically because it shows a
  model can look successful on a single held-out split while still
  failing to generalize across crops, which is exactly the failure
  mode this project's dual-condition validation gate exists to catch.
- **Served via:** `POST /api/v1/ai/arnesano-soil-moisture-forecast` —
  refuses (`available: false`) given `candidate` status.
- **Site/crop-mismatch caveat (structural):** every successful
  response is required by code to note the model barely beats
  persistence in-distribution and lost to it on a held-out crop.

## Cumulative picture: THREE real datasets modeled, THREE candidates, ZERO promotions
This is stated plainly because it is the honest state of the project,
not because it is a comfortable one. Every model remains available for
future retraining once more/better real AgriSmart data exists (see
AGRISMART_REAL_DATA_COLLECTION_PLAN.md) — none was deleted, hidden, or
quietly reinterpreted as a success.

## Safety properties common to ALL THREE models (verified by tests, not just documented)
- Never called directly by any actuation path — `commandsService` /
  `irrigationService`'s open/closeValve are never imported or called by
  any AI inference or training file (`tests/ai/safetyBoundary.test.js`,
  `tests/ai/evolvingTomato/inferenceAndSafety.test.js`).
- Both API endpoints return advisory JSON only.
- Both refuse to serve when: model status is not
  `validated`/`active`; the caller's `featureVersion` doesn't match the
  saved model's; there isn't enough history (`MIN_HISTORY_POINTS`); or
  current readings are far out-of-distribution (≥3 OOD features) —
  never forcing a low-confidence guess through silently.
- AgriSmart's existing irrigation safety/rules engine remains fully
  authoritative and untouched by this project (rule 19) — nothing here
  changes valve behavior, thresholds, or overrides.

## Production-readiness verdict
**None of the three models is production-ready.** All three remain `candidate`. This
project does not recommend promoting any of the three models, does not
recommend enabling any of the three API endpoints' output for end-user-facing
recommendations, and explicitly recommends the real-data collection
plan below as the path to a model that might eventually validate on
AgriSmart's own actual site and behavior.
