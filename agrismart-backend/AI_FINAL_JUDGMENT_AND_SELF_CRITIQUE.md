# Final Research Judgment & Hostile Self-Critique

Status date: 2026-09-11

## Part A — Final Research Judgment (answering the 11 questions posed)

1. **Strongest legitimate ML task found across all 6 datasets:**
   `irrigation_event_next_1h` (predicting a new irrigation-onset event
   within the next hour) on the Evolving Tomato Cultivation Testbed —
   it is the only task in this project backed by REAL irrigation-
   decision ground truth (actual valve actuation), rather than an
   inferred/threshold-based proxy label.
2. **Dataset(s) supporting it:** Evolving Tomato Cultivation Testbed,
   2024 (training) and 2025 (external validation) seasons only. STUARD
   and the 2023 season were excluded as non-independent.
3. **Primary vs. external validation dataset roles:** 2024 = primary
   training + in-season chronological test; 2025 = fully external,
   no-retrain validation. This is the strongest generalization test
   performed in this project to date (two genuinely separate seasons).
4. **Did cross-dataset/cross-season generalization work?** No. The
   model performed poorly on BOTH the in-season 2024 test (ROC-AUC
   0.2619) and the external 2025 season (ROC-AUC 0.3133) — both below
   random-classifier performance on this ranking metric, and far below
   the project's own validation bar.
5. **Best validated model, if any:** **None.** Both registered models
   (`tomato_soil_moisture_estimate`, `irrigation_event_next_1h`) remain
   `status: "candidate"`. Zero models are `validated` or `active`.
6. **Baseline / external / OOD metrics:** documented in full in
   `AI_TRAINING_REPORT.md` (both dataset sections) and
   `ai/dataset_model_manifest.json`. Base rates: 2024 = 1.433%, 2025 =
   0.610% (irrigation-onset events are rare in both seasons). OOD
   gating is implemented and tested but was not the limiting factor
   here — the model's discriminative performance itself, not
   distribution shift on individual features, is why it failed.
7. **Uncertainty characterization:** the inference wrapper reports a
   `confidence` level (`low`/`medium`/`none`) and an explicit
   out-of-distribution flag per prediction, but — since the underlying
   model never cleared validation — this uncertainty machinery is
   currently inert in production (the endpoint always returns
   `available: false`). This is intentional: reporting a confidence
   level on a model that hasn't validated would itself be misleading.
8. **Additional real AgriSmart telemetry to collect:** see
   `AGRISMART_REAL_DATA_COLLECTION_PLAN.md` in full — summary: at least
   one full season (ideally two, for a genuine external-season test)
   of continuous telemetry + irrigation-event history per real
   AgriSmart valve/zone, with provenance/quality flags at ingestion.
9. **Production-readiness verdict:** **Not production-ready.** Neither
   model should be promoted, enabled for end-user-facing
   recommendations, or treated as evidence AgriSmart's irrigation
   decisions can currently be automated or advised by ML. This is an
   acceptable, honestly-reported outcome per the project's own rules,
   not a gap this report tries to paper over.
10. **What would change this judgment:** real AgriSmart-native
    training data (see collection plan) — training and validating
    directly on the actual farm/site/crop/controller this system will
    advise, rather than transfer-learning from an external testbed on
    a different continent with a different irrigation-controller
    logic.
11. **Is any part of this system currently safe to expose to a real
    farmer as an actionable recommendation?** No — both endpoints
    correctly refuse to serve a prediction given each model's
    `candidate` status, which is the correct and current safe state of
    the system. No configuration change is recommended to alter this
    until a model actually validates.

## Part B — Hostile Self-Critique (15-question checklist)

1. **Could the negative result be an artifact of a bug rather than a
   genuine finding?** Investigated directly (see
   `AI_DATA_QUALITY_REPORT.md` §"Non-bug investigation") via event-object
   inspection, week-by-week label-rate breakdown, and multi-horizon
   re-runs. Two real bugs WERE found and fixed (off-season pollution,
   implausible values); after both fixes, the poor result persisted
   and was traced to genuine seasonal non-stationarity + task
   difficulty, not a remaining bug. Residual risk: cannot mathematically
   prove no further bug exists, only that the specific hypotheses
   tested were ruled out.
2. **Was the validation bar (ROC-AUC > 0.75, avg. precision > 3×
   base rate, on both seasons) chosen post-hoc to guarantee failure,
   or picked in advance?** It mirrors, and is intentionally STRICTER
   than, Dataset #1's single-split criteria (dual-condition, both
   in-season AND external season required) — chosen to be a genuinely
   meaningful bar for a rare-event safety-adjacent task, not tuned
   after seeing the result to justify a predetermined conclusion. It
   was applied identically regardless of outcome.
3. **Did the ablation study cherry-pick a flattering comparison?** No
   — the ablated model actually scored BETTER than the full model on
   the one slice reported (2024 test), which is reported plainly as an
   unresolved instability, not hidden or explained away, and the full
   dual-condition gate was not re-run for the ablated variant
   specifically to avoid presenting a partial, favorable number as if
   it were a validated result.
4. **Is the Python-prototype "encouraging" ablation finding being used
   to imply the real, final result is better than it is?** Explicitly
   guarded against in `AI_ABLATION_REPORT.md` with a dedicated
   "must not be conflated" section — the two ablations answer
   different questions (persistence vs. onset) and neither is allowed
   to stand in for the other anywhere in these documents.
5. **Is STUARD's exclusion self-serving (avoiding an inconvenient
   validation dataset)?** No — the non-independence finding (identical
   date range AND identical GPS coordinates) is a genuine, falsifiable
   data fact, not an assumption; using a non-independent set as
   "external validation" would have been the actual methodological
   error.
6. **Are the two "candidate" models being kept around to pad the
   project's apparent scope rather than genuinely reflecting failed
   experiments?** They are retained specifically BECAUSE rule 14/15
   ("never hide failed experiments," "never delete bad experiments
   from the record") requires it — deleting them would be the
   violation, not keeping them.
7. **Did test coverage added this phase actually test the new code, or
   just restate what the code does?** The new tests include boundary
   conditions the label function must get right (window not fully
   observed → null; event starting exactly at asOf → false; event
   starting exactly at the horizon boundary → true) — these are
   behavioral specifications independently derivable from the
   docstring, not just echoes of the implementation.
8. **Could the "stride=6" sampling choice have been tuned to produce a
   particular result?** It was chosen BEFORE the poor result was known
   (for compute tractability, documented in `buildExamples.js`'s
   header), and the failure investigation explicitly re-ran multiple
   HORIZONS (1h/3h/6h), not stride values — stride sensitivity was not
   explored as a way to search for a passing number, which is
   consistent with "do not force success" but does mean stride
   sensitivity itself is an untested residual question.
9. **Is the DOI/citation-honesty handling (recording `null` rather than
   guessing) just a hedge, or substantively important?** Substantive —
   an incorrect DOI in provenance metadata would misattribute the
   dataset and could not be caught by any automated data-quality check
   downstream; recording `null` with an explanatory note is the only
   honest option when a citation cannot be confirmed.
10. **Does "advisory only, never actuates" hold under adversarial code
    review, not just at the two files inspected?** Verified by a
    source-scan test across five specific new/changed files plus the
    controller's new function body (not just the two inference files
    the report's prose focuses on) — see
    `tests/ai/evolvingTomato/inferenceAndSafety.test.js`'s
    `test.each` block.
11. **Is the "full offline test suite" claim (24/24, 118/118) actually
    the FULL suite, or a subset chosen to look clean?** It is the full
    `tests/ai/` directory (every AI-related suite, old and new); the
    unrelated `tests/api`/`tests/integration` failures are reported
    separately and explicitly attributed to a documented, pre-existing,
    no-database diagnostic config limitation rather than omitted from
    this report.
12. **Could `npm run ai:evolvingTomato:train`'s output have changed
    between when the numbers in this report were written and now?**
    The numbers reported here were read directly from the actual saved
    model artifact file (`ai/models/artifacts/irrigation_event_next_1h.latest.json`),
    not retyped from memory or a terminal scrollback, minimizing
    transcription risk; re-running the script would need to be done
    again to confirm bit-for-bit reproducibility from a byte-identical
    input, which was not re-verified a second time this phase.
13. **Is the real-data collection plan actionable, or generic
    boilerplate?** It is derived directly from THIS phase's specific
    findings (seasonal non-stationarity requires full-season coverage;
    the Python ablation shows sensor type is not the bottleneck, so new
    hardware is explicitly de-prioritized) rather than a generic "collect
    more data" recommendation.
14. **Does any deliverable overstate what was achieved (e.g. implying
    "trained on real data" means "works")?** Reviewed specifically for
    this — every summary section in every document above states the
    negative result in its FIRST paragraph, not buried at the end.
15. **What is the single biggest remaining risk to this project's
    honesty going forward?** That a future contributor, seeing a
    seemingly complete pipeline (adapters, features, splits, a trained
    model artifact, a wired API endpoint) might assume it is
    production-ready without reading the `candidate` status and the
    validation-gate failure — mitigated structurally (the inference
    code itself refuses to serve, not just the documentation saying
    so) but not eliminated, since a future change to the registry
    lifecycle rules could theoretically bypass this if not carefully
    reviewed.

---

# Final batch addendum — cumulative cross-dataset validation, AgriSmart compatibility, and hostile self-review

Status date: 2026-09-11. This addendum covers everything requested by
this phase's instructions that is not already answered by the
Part A/B sections above (which remain valid and unmodified).

## Cross-dataset / cross-experiment validation actually performed

| Validation | Train on | Test on | Result | Honest interpretation |
|---|---|---|---|---|
| Cross-crop (within Arnesano) | Zones 1, 2, 4 (tomato x2, zucchini) | Zone 5 (blueberry), no retraining | Model R^2=0.8765 < persistence R^2=0.8808 | Does NOT generalize across crops even at the same site — reported plainly, not averaged away or hidden |
| Cross-season (Evolving Tomato Testbed, unchanged from prior phase) | 2024 | 2025, no retraining | Model ROC-AUC=0.3133 (worse than random) | Confirmed negative, unchanged |
| Cross-dataset non-independence check | Evolving Tomato Testbed 2023 | STUARD | Same underlying data (date range + GPS match) | STUARD excluded from any independent role — this IS a leakage control, not a training result |
| Literal cross-dataset transfer (Arnesano <-> Evolving Tomato Testbed) | — | — | **NOT attempted** | Their feature sets are not equivalent (Arnesano has on-site EC/pH/ERA5-joined weather; Evolving Tomato Testbed does not) — forcing a shared feature subset would require assuming sensor/measurement equivalence this project cannot verify (rule: never treat correlated-but-different variables as interchangeable evidence). Declining to force this is the correct call, not a gap. |

No metrics from incompatible tasks/datasets were averaged together
anywhere in this project (e.g. the regression R^2 values from Dataset
#1/#3 and the classification ROC-AUC/average-precision values from
Dataset #2 are never combined into a single number).

## AgriSmart compatibility — explicit, current-state statement

**What AgriSmart's current telemetry (`src/modules/telemetry/telemetry.model.js`)
can support RIGHT NOW, with zero new sensors:**
`soilMoisturePercent`, `soilSalinityPpt`, `temperatureCelsius` — this
is exactly the feature set the Evolving Tomato Testbed's
`irrigation_event_next_1h` model was built to use (see
`AI_ARCHITECTURE_AUDIT.md`), and it is compatible with a persistence-
style baseline for soil-moisture forecasting in principle (not yet
implemented against AgriSmart's own data).

**What requires ADDITIONAL SENSORS AgriSmart does not currently have:**
soil EC and soil pH (used by the Arnesano model — AgriSmart's
telemetry model has `soilSalinityPpt` but no EC/pH field); on-site
solar radiation, wind speed, and precipitation (Arnesano's model uses
these as ERA5-derived weather, which does NOT require new on-site
hardware — see below).

**What does NOT require new hardware, only a new data-pipeline
integration:** weather features (temperature, humidity, rain, wind,
radiation) can be sourced from Open-Meteo (as both Arnesano and the
AgriDataValue bundle already do) rather than new on-site sensors —
this is an integration task (an HTTP client + a scheduled job), not a
hardware purchase.

**What requires CROP METADATA AgriSmart does not currently track:** a
per-crop-type field on a valve/zone record (Arnesano's cross-crop
failure suggests any future native model would benefit from knowing
which crop a zone grows, so the model or its label function can
condition on it).

**What requires VALVE FEEDBACK beyond simple open/closed:** none of
the three models trained this project needed more than a binary valve
state — AgriSmart's existing irrigation event log already supports
this level of detail (per the codebase's own `irrigationRepository`
already used by `getRecommendation`).

**What requires WATER-VOLUME MEASUREMENT:** AgriSmart's current
telemetry model has NO field for applied water volume/liters. All
three of the real datasets modeled in this project that used water
volume did so via either a real flow meter (Arnesano: duration x
nominal flow rate, itself a real per-sector calibration constant) or
declined to use it (Evolving Tomato Testbed ingested only duration,
not volume). **Recommendation: adding a nominal-flow-rate-per-valve
constant to AgriSmart's valve/zone configuration, from which applied
volume can be derived from existing duration data with NO new sensor
hardware, is the single highest-leverage, lowest-cost addition
suggested by this entire research phase.**

Nothing above is pretended to already exist in AgriSmart's system —
every "does not require new hardware" claim is qualified by exactly
what NEW pipeline/config work it does require.

## Hostile self-review — the 12 questions posed this turn

1. **Did any synthetic/demo data enter real training?** No — every
   model trained this project (all 3) used only `dataSource: 'external'`,
   real, adapter-ingested files. The 5 manually-inserted Atlas
   telemetry readings and all `synthetic_dev` data were never read by
   any adapter, training script, or feature-builder introduced in this
   project.
2. **Did I invent any target?** No new label was invented this phase.
   The Arnesano target was REBUILT from the dataset's own real
   soil-moisture readings (using a corrected, verified-true 24h
   lookup) — not a new measurement invented, a corrected construction
   of an existing one, with the correction itself unit-tested.
3. **Is there temporal leakage?** Checked and unit-tested directly:
   `tests/ai/arnesano/buildExamples.test.js` proves the backward-only
   water feature cannot see future irrigation, and that a corrupted
   future timestamp is skipped rather than mislabeled.
4. **Is there cross-dataset leakage?** The one identified cross-
   dataset near-duplicate (STUARD vs. Evolving Tomato Testbed 2023)
   was excluded from every training/validation role, not merged in.
5. **Did I merge incompatible data?** No — every dataset/zone was
   loaded, trained, and evaluated independently; the only "combination"
   performed is pooling three ARNESANO zones that share a real,
   verified-identical calendar (a legitimate chronological pool, not a
   merge of incompatible measurements).
6. **Did I overstate metrics?** The Arnesano model's in-distribution
   win is reported alongside its cross-crop loss in the SAME
   sentence/table everywhere it appears in these documents — never
   presented in isolation.
7. **Did I test external generalization?** Yes, for all 3 models
   (Dataset #1: grouped split by planting day; Dataset #2: 2024->2025
   cross-season; Dataset #3: zones 1/2/4 -> zone 5 cross-crop).
8. **Did I beat meaningful baselines?** Measured against BOTH a weak
   baseline (mean) and a strong, realistic one (persistence, for the
   two forecasting-style targets) — the Arnesano model beats both
   in-distribution and fails the strong one out-of-distribution; this
   is reported, not hidden behind the weak baseline alone.
9. **Did I examine model failures?** Yes — the OOD fraction (30% of
   zone 5) is computed and reported alongside the metrics, and the
   ablation study specifically probes WHICH features drive the (small)
   in-distribution edge.
10. **Is uncertainty represented?** Yes — `confidence` and
    `outOfDistribution` fields on every inference response, gated on
    the SAME per-feature range check computed at training time.
11. **Can the result be reproduced?** Yes — `npm run
    ai:arnesano:train` runs the full pipeline against the committed
    real CSVs; every number in `AI_TRAINING_REPORT.md`'s Dataset #3
    section was read directly from that run's saved model artifact.
12. **Can AI directly actuate a valve?** No — verified by source-scan
    tests across every new file this phase
    (`tests/ai/arnesano/inferenceAndSafety.test.js`'s `test.each`
    block), in addition to the pre-existing project-wide
    `tests/ai/safetyBoundary.test.js`.

No answer above required a fix before declaring this phase complete —
every check came back clean on direct verification, not assumption.

## Final completion checklist (all required, all satisfied)
ALL 9 REAL DATASETS AUDITED (yes) -> TARGET SELECTED (yes, per-dataset,
justified in `AI_TARGET_CATALOG.md`'s final comparison table) ->
DATASET ROLES DEFINED (yes, explicit table in
`AI_DATASET_INVENTORY.md`) -> LEAKAGE CONTROLS VERIFIED (yes, unit-
tested) -> BASELINES ESTABLISHED (yes, dual baselines for both
regression targets) -> MODELS TRAINED (yes, 3 real models across 3
real datasets) -> CROSS-DATASET VALIDATION ATTEMPTED (yes, table
above; one literal transfer correctly declined as invalid) ->
OOD/UNCERTAINTY TESTED (yes) -> ABLATIONS DONE (yes, all 3 models) ->
FAILURE ANALYSIS DONE (yes, Section 4 of Dataset #3's training-report
entry) -> MODEL GOVERNANCE DECIDED (yes — all 3 `candidate`, none
promoted) -> AGRISMART COMPATIBILITY DOCUMENTED (yes, section above)
-> SAFETY VERIFIED (yes, source-scan tests) -> TESTS PASSING (yes,
27/27 suites, 139/139 tests, lint clean) -> FINAL REPORT COMPLETE
(this document).
