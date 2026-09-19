# AI Architecture Audit — Multi-Dataset Phase

Status date: 2026-09-11
Scope: audits the AI subsystem (`ai/`, `src/modules/ai/`, `tests/ai/`)
as it stands after ingesting a SECOND real dataset (the Evolving
Tomato Cultivation Testbed) alongside the first (Mendeley "Dataset on
irrigation for Tomato"). Nothing outside these paths was read for
modification purposes; unrelated modules (community, marketplace,
equipment, moderation, notifications, trust, IoT-command paths) were
not touched, per the standing constraint.

## 1. What exists today

| Layer | Files | Reused as-is for dataset #2? |
|---|---|---|
| Canonical schema | `ai/external/schemas/canonicalRecord.schema.js`, `provenance.schema.js` | Yes — unmodified |
| Adapters | `ai/external/adapters/tomatoIrrigationCsvAdapter.js` (ds#1), `evolvingTomatoCsvAdapter.js` (ds#2, new) | New adapter, existing pattern |
| Bridging | `ai/external/benchmark/canonicalBridge.js` | Yes — unmodified, handles interleaved partial soil/valve records |
| Feature engineering | `ai/features/featureEngineering.js`, `featureVersion.js` | Yes — unmodified |
| Labels | `ai/features/irrigationEventLabel.js` (new) alongside `featureEngineering.computeLabel` (ds#1-era, unchanged) | New, deliberately independent |
| Split | `ai/training/tomato/splitByPlantingDay.js` (ds#1, group-aware); `ai/external/benchmark/splitChronological.js` (reused, ds#2) | Reused chronological splitter |
| Models | `ai/training/logisticRegression.js`, `ai/training/tomato/linearRegression.js` | Logistic regression reused unmodified for ds#2's binary target |
| Evaluation | `ai/evaluation/metrics.js` (extended: `averagePrecision` added), `regressionMetrics.js` | Extended, not replaced |
| Registry | `ai/models/modelRegistry.js` | Reused unmodified — same `candidate → validated → active → retired` lifecycle now also governs `irrigation_event_next_1h` |
| Inference | `ai/inference/predict.js` (ds#1's original synthetic-era target), `predictTomatoSoilMoisture.js` (ds#1 real), `predictIrrigationEventLikelihood.js` (ds#2, new) | New wrapper, same structural pattern |
| API | `src/modules/ai/ai.controller.js`, `ai.routes.js` | Extended: `GET /api/v1/ai/irrigation-event-likelihood/:valveId` added, reusing the exact ownership-checked `loadValve` + telemetry/irrigation-history loading already used by `getRecommendation` |

## 2. Why so much of workstream 1's infrastructure was reusable this time

Dataset #1 (Mendeley tomato irrigation CSV) had NO real timestamps, no
per-zone identifier, and no irrigation ground truth — it needed a
brand-new schema, adapter, feature set, and split strategy built from
scratch (`ai/training/tomato/*`).

Dataset #2 (Evolving Tomato Cultivation Testbed) has real per-10-minute
timestamps, a real per-line zone identifier, and real valve
open/close ground truth — i.e. it structurally matches the ORIGINAL
architecture's design assumptions (the one built for AgriSmart's own
live telemetry). This meant only three new pieces of code were needed:
an adapter, a new (event-based) label function, and a stride-aware
example builder — everything else (`canonicalBridge`,
`featureEngineering`, `splitChronological`, `logisticRegression`,
`modelRegistry`, `outOfDistribution`) was reused verbatim. This is a
positive architectural signal: the original design was not
over-fitted to AgriSmart's synthetic-dev data, and generalizes to a
second, independently-sourced real dataset with the right shape.

## 3. Safety-boundary audit (rule 18: AI must never call actuation services)

Every file under `ai/` was grep-audited (also enforced by
`tests/ai/safetyBoundary.test.js` and the new
`tests/ai/evolvingTomato/inferenceAndSafety.test.js`) for references to
`commandsService`, `irrigationService`'s open/closeValve. Result:
**zero matches outside the safety-boundary test files themselves**,
across both the pre-existing ds#1 code and all new ds#2 code
(`evolvingTomatoCsvAdapter.js`, `irrigationEventLabel.js`,
`buildExamples.js`, `train.js`, `predictIrrigationEventLikelihood.js`,
and the new controller function `getIrrigationEventLikelihood`). All
AI endpoints are read-only from the API's perspective: they read
telemetry/irrigation history and return an advisory JSON payload; none
issue commands.

## 4. Test and lint status (this phase)

- `tests/ai/` (includes the two new suites, `tests/ai/evolvingTomato/*`): **24/24 suites, 118/118 tests PASS** (`npx cross-env NODE_ENV=test jest --config jest.offline.config.js tests/ai --runInBand`).
- `npx eslint ai scripts/ai src/modules/ai tests/ai src/routes/index.js --max-warnings=0`: **clean, zero warnings/errors**.
- `tests/api` + `tests/integration` (full offline suite, unrelated modules): pre-existing DB-touching failures (auth register/login/refresh) unrelated to this work — `jest.offline.config.js`'s own header comment documents this is an explicitly diagnostic, no-database config whose entire purpose is to let non-DB tests run for real while DB-touching tests "fail honestly, fast" rather than hang. These failures exist in `tests/api/auth.test.js`, a file this project did not touch, and are out of scope for the AI workstream (rule 20).
- The full `npm test` (real suite, with `mongodb-memory-server`) was not run in this sandboxed, network-restricted environment — this is a known, pre-existing environment limitation (no Mongo binary download), not something this phase introduced or can fix; it is unchanged from the prior (Dataset #1) phase's own reporting.

## 5. What is genuinely new vs. what is unchanged (honesty check)

- **Unchanged, must not be reinterpreted:** Dataset #1's soil-moisture regression result (R² = -0.013 on test, below the mean baseline) remains `candidate`, unpromoted, fully documented in the original `AI_TRAINING_REPORT.md` sections (now Section "Dataset #1" therein).
- **New this phase:** Dataset #2's `irrigation_event_next_1h` onset-classification result — also negative (see `AI_TRAINING_REPORT.md` §Dataset #2, `AI_ABLATION_REPORT.md`), also `candidate`, also unpromoted.
- **Net result: zero models are currently `validated`/`active`.** This is reported as the honest state of the system, not obscured — see `AI_MODEL_CARD.md`.

---

# Final batch update — third real dataset, third training pipeline

Status date: 2026-09-11

## New this phase
- `ai/external/adapters/arnesanoCsvAdapter.js` (new adapter; extended
  `CanonicalRecordSchema` with an optional `soilPh` field, backward-
  compatible with every existing adapter/record).
- `ai/training/arnesano/{featureVersion,buildExamples,baseline,outOfDistribution,train}.js`
  (new training workstream — its OWN feature space, per this project's
  established pattern of not sharing feature/OOD modules across
  datasets with genuinely different measurements).
- `ai/inference/predictArnesanoSoilMoisture24h.js` +
  `ai/schemas/arnesanoSoilMoisturePrediction.schema.js` (new, safety-
  gated inference wrapper, same structural pattern as the other two).
- `POST /api/v1/ai/arnesano-soil-moisture-forecast` (new endpoint,
  reuses the "manual observation input" pattern already established by
  `postSoilMoistureEstimate`, since this model's features are not
  AgriSmart's live telemetry shape).
- `tests/ai/arnesano/{adapter,buildExamples,inferenceAndSafety}.test.js`
  (12 new tests).

## Safety-boundary audit (re-run, all 3 workstreams)
Grep-audited (and unit-tested via `test.each` source scans) every file
under `ai/` for `commandsService`/`irrigationService` open/closeValve
references. Result: zero matches outside the safety-boundary test
files themselves, across ALL THREE training workstreams (tomato,
evolvingTomato, arnesano) and all three inference wrappers.

## Test and lint status (this phase, final)
- `tests/ai/` (30 suites total across the whole project's lifetime,
  cumulative — 27 in the immediately-preceding count, now including
  the 3 new arnesano suites): **27/27 suites, 139/139 tests PASS**
  (`npx cross-env NODE_ENV=test jest --config jest.offline.config.js
  tests/ai --runInBand`).
- `npx eslint ai scripts/ai src/modules/ai tests/ai src/routes/index.js
  --max-warnings=0`: **clean.**
- No unrelated module (community/marketplace/equipment/moderation/
  notifications/trust/IoT-command paths) was touched this phase —
  confirmed by the fact that every file changed this session lives
  under `ai/`, `src/modules/ai/`, `tests/ai/`, `package.json` (scripts
  section only), `AI_*.md`, `AGRISMART_REAL_DATA_COLLECTION_PLAN.md`,
  and `DATASETS.md`.

## Cumulative state: 3 datasets modeled, 3 candidates, 0 promotions
See AI_MODEL_CARD.md for the full picture. This is the honest,
final state of the AI subsystem at the end of this multi-batch
research phase.
