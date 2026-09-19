# AgriSmart AI / ML Intelligence Layer

This directory is a **separate, isolated workstream** from the core MVP
(`src/`). It never modifies existing rule-based irrigation logic
(`src/modules/irrigation/irrigation.service.js`), and nothing in here is
permitted to issue device commands directly — see "Safety boundary" below.

## Honesty statement (read this first)

As of this writing, AgriSmart has **no persistent store of real
agricultural telemetry**. Confirmed during the data-readiness audit:

- `agrismart-backend/.env` points `MONGODB_URI` at a local
  `mongodb://127.0.0.1:27017/agrismart` with no `mongod` process running
  in this environment.
- The only telemetry-generating code path, `scripts/demoSimulator.js`,
  explicitly boots an **ephemeral in-memory MongoDB**
  (`mongodb-memory-server`) that is discarded when the demo process
  exits. It exists to prove the ingestion → decision → command →
  execution pipeline works end-to-end for a presentation, not to
  accumulate a training corpus.
- There are no CSVs, exports, or archived telemetry dumps anywhere in
  the repository.

**Conclusion: there is not enough real data to train or validate a
trustworthy supervised model today.** This is a normal, expected state
for a pre-launch IoT product and is treated as such (see
`DATA_READINESS.md`). This codebase is therefore built in
**data-scarcity mode**: a complete, tested, production-shaped ML
pipeline, exercised end-to-end against a clearly-labeled **synthetic
development dataset** (`ai/data/dev/`) for pipeline verification only.
No metric produced against that synthetic data is a claim about
real-world agricultural accuracy, and the code refuses to describe it
that way (see `models/modelRegistry.js` `dataSource` field, which every
consumer must check).

## Pipeline

```
raw telemetry + irrigation events (Mongo)
        -> data/telemetryLoader.js       (validation, missing-value handling)
        -> features/featureEngineering.js (lag/rolling/derived features, no leakage)
        -> data/datasetBuilder.js         (labeled examples, chronological order preserved)
        -> training/splitChronological.js (time-ordered train/val/test split)
        -> training/train.js              (baselines + logistic regression)
        -> evaluation/evaluate.js         (metrics vs. baseline)
        -> models/modelRegistry.js        (versioned JSON artifact + metadata)
        -> inference/predict.js           (feature extraction -> model -> prediction)
        -> services/aiInsightService.js   (hybrid rules+AI recommendation, explainable)
```

## Chosen first ML problem

**Irrigation-need prediction**: given a valve's telemetry history up to
time T, will soil moisture cross below that valve's own configured
`autoOpenBelowPercent` threshold within the next 3 hours (if it hasn't
already)? Binary classification.

Why this one first, and not the alternatives:

- **Soil moisture forecasting (regression)** would need a much larger,
  denser real dataset to validate a continuous-value forecast
  meaningfully (MAE/RMSE on synthetic data is not informative about
  real soil physics). Revisit once real telemetry accumulates.
- **Irrigation duration recommendation** needs an *outcome* label (did
  the applied duration actually restore moisture to a healthy level
  without overwatering?) which nothing in the schema captures yet.
  Building this now would mean inventing ground truth — explicitly
  forbidden by this task.
- **Anomaly detection** is a reasonable unsupervised alternative and
  is worth building next, but it does not plug into the hybrid
  rules+AI decision engine (`services/aiInsightService.js`) as directly
  as irrigation-need prediction does.
- Irrigation-need prediction reuses fields and thresholds that
  **already exist** in production (`Valve.autoOpenBelowPercent`,
  `Telemetry.readings`, `IrrigationEvent`), so no new instrumentation,
  schema change, or unverified assumption is required to define the
  label.

## Safety boundary (non-negotiable)

```
AI recommendation (probability + explanation)
        v
Rules (existing thresholds, unchanged)
        v
Safety (daily allowance, max duration, device online, emergency stop)
        v
Command -> Device -> Verification
```

Nothing under `ai/` calls `commandsService`, `irrigationService.openValve`,
or any other actuation path. `services/aiInsightService.js` returns a
recommendation object only; a human (or, in future, the existing
automation path in `irrigation.service.js`, unmodified by this work)
decides whether to act on it. If model inference fails or is
unavailable for any reason, the caller receives an explicit
`fallback: true` response — it never throws in a way that could stall
an existing decision loop, and it never silently returns a fabricated
prediction.

## Commands

```
npm run ai:prepare   # loads/validates data, reports data-readiness
npm run ai:train     # builds dataset, trains baseline + model, saves artifact
npm run ai:evaluate  # evaluates the latest saved model against its test split
npm run ai:predict    # runs one example inference against the latest model
```

## No-fake-AI checklist enforced by this code

- Model metadata (`models/modelRegistry.js`) always records
  `dataSource: 'synthetic-dev' | 'real'` and refuses to load a
  synthetic-dev model as the basis for an API response without a
  clear `synthetic: true` flag reaching the caller.
- Confidence is derived from actual sample counts / data recency, never
  randomized.
- Explanations are generated only from the feature values the model
  actually used (`inference/explain.js`), never invented text.
