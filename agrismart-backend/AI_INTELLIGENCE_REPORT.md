# AgriSmart AI/ML Intelligence Layer — Final Report

Isolated workstream under `agrismart-backend/ai/` (+ thin integration in
`src/modules/ai/`, `src/routes/index.js`, `scripts/ai/`, `tests/ai/`,
and `agrismart-frontend/src/components/AiInsightCard.jsx`). No existing
rule-based logic (`irrigation.service.js`) was modified.

## 1–2. Data availability and quality

**Zero real agricultural telemetry exists in this project today.**
`.env`'s `MONGODB_URI` points at a local Mongo with no server running;
the only telemetry-producing code path (`scripts/demoSimulator.js`)
deliberately uses an ephemeral in-memory database discarded on exit,
built to demo the pipeline live, not to accumulate training data. Full
detail and reproduction steps: `ai/DATA_READINESS.md` and `npm run
ai:prepare`.

## 3–4. Chosen AI problem and why

**Irrigation-need prediction**: binary classification — will a valve's
soil moisture cross below its own configured `autoOpenBelowPercent`
within the next 3 hours (given it hasn't already)? Chosen over
moisture forecasting (needs more data to validate a regression
meaningfully), duration recommendation (no outcome-effectiveness label
exists in the schema — would require inventing ground truth), and
anomaly detection (valid next step, but doesn't plug into the hybrid
rules+AI decision engine as directly). Full reasoning: `ai/README.md`.

## 5. Features (16, `ai/features/featureEngineering.js`)

Current moisture, lagged moisture (1h/3h/6h), 1h moisture change, 3h
rolling average, 6h rolling min/max, linear 6h trend, temperature,
salinity, hours since last irrigation, irrigation minutes in last
6h/24h, hour of day, day of week. Every feature is computed only from
data at or before the prediction timestamp — proven by an explicit
leakage test (`tests/ai/featureEngineering.test.js`: future telemetry
appended to history must not change the computed feature vector).

## 6. Model(s)

A from-scratch, dependency-free logistic regression (batch gradient
descent, L2 regularization, mean-imputation + standardization fit only
on the training split) — `ai/training/logisticRegression.js`. No
XGBoost/LightGBM/heavy ML library: unnecessary for ~16 features and an
MVP-scale dataset, and this keeps the whole model auditable and
CPU-trivial.

## 7. Baselines

- **Persistence**: since examples already exclude "already below
  threshold" points, persistence always predicts "no" — F1 undefined
  (0 positive predictions), accuracy ~90.7% (reflects class imbalance,
  not real skill).
- **Trend extrapolation**: linearly projects the existing
  `moistureTrendPerHour` feature forward 3h against the threshold —
  the strongest non-ML baseline available from data already in the
  system.

## 8. Evaluation methodology

Chronological split (`ai/training/splitChronological.js`): oldest 70%
train, next 15% validation, latest 15% test — **no shuffling**.
Classification metrics only (precision/recall/F1/accuracy/ROC-AUC via
rank-based AUC) — no regression metrics reported, since this is a
classifier.

## 9. Metrics (latest run, **synthetic-dev data**, n=643 test examples)

| | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---|---|---|---|---|
| Logistic regression | 0.975 | 0.833 | 0.917 | **0.873** | 0.996 |
| Trend baseline | 0.938 | 0.628 | 0.817 | 0.710 | — |
| Persistence baseline | 0.907 | — | 0.000 | — | — |

## 10. Does AI beat the baseline?

**Yes, on synthetic-dev data** (F1 0.873 vs. 0.710 trend / undefined
persistence). This is **not** a claim about real-world agricultural
accuracy — see §13.

## 11–12. Model version / training sample count

`irrigation_need_next_3h-logistic_regression v1` (also re-verified as
v2 in this session), `featureVersion: v1`, trained on 4,285 labeled
examples (2,999 train / 643 val / 643 test) derived from 4,320 raw
synthetic telemetry points over 45 simulated days.

## 13. Real vs. synthetic-dev data

**100% synthetic-dev.** Every model artifact records
`dataSource: 'synthetic-dev'` and `status: 'development'`;
`ai/inference/predict.js` propagates a `synthetic: true` flag and a
plain-language `reason` into every API/UI response so this is never
hidden from a consumer. `ai/training/train.js` will only certify a
model as `dataSource: 'real'` once ≥500 real labeled examples exist
(`MIN_REAL_EXAMPLES`) — currently 0.

## 14. API integration

`GET /api/v1/ai/status`, `/model`, `/health` (auth required),
`GET /api/v1/ai/recommendations/:valveId` (same ownership-checked
`loadValve` middleware as the irrigation module — no separate, weaker
access path). Read-only; never issues device commands.

## 15. Frontend integration

`AiInsightCard.jsx` on the Dashboard: shows probability, confidence,
explanation, and recommendation exactly as the API returns them, with
a visible "dev model" badge whenever `synthetic: true`, and "AI insight
unavailable — collecting more data" when `available: false`. No
fabricated confidence is ever shown.

## 16. Commands

```
npm run ai:prepare   # data-readiness report
npm run ai:train     # build dataset, train, evaluate, save artifact
npm run ai:evaluate  # re-evaluate latest saved model vs. baselines
npm run ai:predict   # one sample inference (synthetic input, smoke test)
```

## 17. Tests (`tests/ai/`, 7 suites / 22 tests, all passing)

Feature generation + explicit leakage test, missing/invalid telemetry
handling, chronological split ordering, prediction schema validation,
graceful fallback (no model / feature-version mismatch / insufficient
history), model registry save/load/versioning, and — the one this spec
treats as non-negotiable — a safety-boundary test proving
`aiInsightService` never calls `commandsService` or
`irrigationService.openValve/closeValve`, checked both by mocking those
modules and by scanning the service's own source for forbidden
imports. Run: `npx cross-env NODE_ENV=test jest --config
jest.offline.config.js tests/ai`. Ran the **full** existing offline
suite too — only the two pre-existing DB-dependent suites
(`tests/iot/telemetry.test.js`, `tests/iot/commands.test.js`) fail, for
the same pre-existing reason documented in `jest.offline.config.js`
itself (no live Mongo in this environment); nothing I added touches
those files.

## 18. Remaining real-data requirements

See `ai/DATA_READINESS.md`: ≥3 devices, ≥30 days each at a realistic
~15–30 min cadence, real irrigation events, before real training is
attempted (500-example minimum enforced in code, not just documented).

## 19. Known limitations

- Chronological split is global, not per-device — fine for today's
  single synthetic device, flagged in
  `ai/training/splitChronological.js` for revisit once multiple real
  devices exist.
- Confidence is capped at "low" for any non-real-data model,
  regardless of how good synthetic metrics look — intentional, not a
  bug.
- No anomaly detection or duration-recommendation model yet (see §4
  for why those were deferred, not skipped).
- Frontend build could not be verified with a full `vite build` in
  this sandboxed environment (missing native `rolldown`/`oxlint`
  bindings for this CPU architecture, and no npm registry egress to
  fetch them) — this is a pre-existing environment limitation, not
  introduced by this change; `AiInsightCard.jsx` and the `Dashboard.jsx`
  edit were verified by lint-equivalent manual review against the
  existing `Card`/`Badge` component signatures instead.

## 20. Reproduce

```
cd agrismart-backend
npm run ai:prepare
npm run ai:train
npm run ai:evaluate
npm run ai:predict
npx cross-env NODE_ENV=test jest --config jest.offline.config.js tests/ai
```

## AI readiness score: **35/100**

Pipeline, feature engineering, safety boundary, versioning, tests, and
API/UI integration are all real and working (would score high on their
own). The score is capped low because the one thing that actually
matters for a farmer-facing recommendation — a model trained and
validated on real soil/climate data — does not exist yet, and none of
the code in this repository claims otherwise.

---

## Addendum: third workstream (external data & benchmarking)

A separate, later workstream added `ai/external/` — dataset adapters,
a canonical research schema, a data-quality engine, leakage guards, and
a benchmark/cross-dataset CLI. See `AI_RESEARCH_REPORT.md` and
`DATASETS.md` for the full account. Headline finding: no real external
dataset could be downloaded in this execution environment (network
egress blocked), so the new infrastructure is real and tested but has
only been exercised against clearly-labeled structural fixtures — not
real field data. Nothing in this addendum changes the readiness score
above; if anything it confirms the same conclusion from a different
angle.
