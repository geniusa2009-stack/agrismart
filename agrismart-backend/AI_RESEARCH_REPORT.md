# AgriSmart AI — Research & Data Benchmarking Report

Third, isolated workstream. Builds on (does not modify)
`AI_INTELLIGENCE_REPORT.md`'s first-workstream pipeline
(`ai/data`, `ai/training`, `ai/inference`, `ai/models`) and adds
`ai/external/` (dataset adapters, canonical schema, quality engine,
leakage guards, benchmark runner, cross-dataset report, experiment
log). No modification to `src/modules/irrigation/irrigation.service.js`
or any actuation path.

## 1. Datasets identified

Six real public datasets cataloged in `DATASETS.md`: USDA NRCS SCAN
(soil moisture/temp + weather, no irrigation data), two Kaggle
IoT-agriculture datasets, a Mendeley plant-health IoT dataset, a
Mendeley-family tomato-irrigation dataset (the one candidate claiming
BOTH sensor and irrigation data for a named crop), and the Open-Meteo
weather archive API.

## 2. Licenses / provenance

Documented per-entry in `DATASETS.md`, with license confidence flagged
honestly where it could not be independently verified (Kaggle/Mendeley
entries — "verify at download time" rather than asserting a specific
license I have not seen applied to the actual file).

## 3. Real vs. synthetic vs. external — and the central finding

**Zero of the six cataloged datasets was actually downloaded.** Direct
HTTP(S) access to any host outside a narrow package-registry allowlist
returns `403` at the network gateway (verified against
`raw.githubusercontent.com` and `zenodo.org` from both the cloud
workspace and the linked development machine); `WebFetch` reached
Open-Meteo's API but was refused by its `robots.txt`, and a prior
interactive approval request for the same URL was never answered.

Consequently: every `dataSource: 'external'` record produced in this
repository today comes from a **structural test fixture** (a handful
of hand-built rows matching a real dataset's documented column layout)
with `provenance.ingested: false` — a flag enforced by
`ai/external/schemas/provenance.schema.js` and checked by every report
generator before it will call a result "real." This is reported here
as a finding, not hidden: **the benchmarking infrastructure is real and
tested; the external data behind it is not, in this environment.**

## 4. Experiments run

- `npm run bench:run -- --dataset=scan-network-fixture` →
  `INSUFFICIENT_DATA` (0 labeled examples derivable from an 8-hour
  fixture with no irrigation events — correct, honest behavior).
- `npm run bench:run -- --dataset=generic-iot-agri-fixture` →
  `INSUFFICIENT_DATA` (7 examples, below the 30-example floor).
- `npm run bench:run -- --dataset=agrismart-synthetic-dev` →
  `COMPLETED` (4,285 examples; same irrigation-need-prediction task as
  the first workstream, re-run through the new benchmark harness as a
  pipeline-correctness check).
- `npm run bench:cross -- --train=agrismart-synthetic-dev --test=generic-iot-agri-fixture`
  → `INSUFFICIENT_DATA` (test side has only 7 examples); `mode:
  'infrastructure-selftest'` because neither dataset is `ingested`.

## 5. Models evaluated

Same dependency-free logistic regression as the first workstream
(`ai/training/logisticRegression.js`) — reused deliberately rather than
re-implemented, so the benchmark harness tests the SAME model code
path AgriSmart would actually run.

## 6. Baselines

Persistence and trend-extrapolation, identical definitions to the
first workstream (§7 of `AI_INTELLIGENCE_REPORT.md`).

## 7. Metrics (synthetic-dev completion run — NOT real-world evidence)

| | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---|---|---|---|---|
| Logistic regression | 0.974 | 0.812 | 0.933 | 0.868 | 0.995 |
| Trend baseline | 0.936 | 0.614 | 0.850 | 0.713 | — |
| Persistence baseline | 0.907 | — | 0.000 | — | — |

`resultsAreTransferable: false` on this run's own JSON report
(`ai/external/reports/agrismart-synthetic-dev.benchmark.json`) —
included here to show the harness produces real numbers, not to claim
model quality.

## 8. Cross-dataset results

Not obtainable: every dataset pairing available involves at least one
fixture too small to clear the 30-example floor, or a fixture with
`ingested: false`. The cross-dataset CLI itself is implemented, tested,
and runs correctly (reports `INSUFFICIENT_DATA` or
`infrastructure-selftest` as appropriate) — see
`ai/external/benchmark/crossDatasetReport.js`.

## 9. Generalization findings

**None available.** No two datasets with sufficient real, ingested
data existed to compare. This is the single most important honest
finding of this workstream: *AgriSmart's AI architecture has not been
shown to generalize beyond synthetic development data, because no real
external dataset could be ingested in this environment.* The domain
shift descriptors the cross-dataset report DOES compute (sensor type,
sampling frequency differ between the synthetic generator and the
generic IoT fixture; country/crop/soil unknown for both) show the
mechanism works, not a validated result.

## 10. Leakage checks

`ai/external/leakage/leakageGuards.js` (7 tests, all passing):
future-feature-time assertion, train/test timestamp-overlap assertion
(throws — not warns — on violation), suspicious label-correlation scan
(target-derived feature screen), and post-irrigation-event measurement
guard. `runBenchmark.js` calls the overlap assertion on every real run
— a LeakageError there aborts the benchmark, it does not get logged
and ignored.

## 11. Explainability

Reused from the first workstream (`ai/inference/explain.js`) —
generates explanation strings only from features the model actually
used; unchanged by this workstream.

## 12. Uncertainty / OOD

New this workstream: `ai/inference/outOfDistribution.js` records
per-feature `[min, max]` from the TRAINING split only (never
validation/test) and flags any inference-time feature falling outside
that range (±15% margin). ≥3 OOD features → prediction refused
(`unavailable`, not forced). 1-2 OOD features → confidence forced to
`'low'` and an explicit explanation line added. Verified in
`tests/ai/external/outOfDistribution.test.js`.

## 13. Safety verification

Unchanged architecture from the first workstream:
`AI recommendation → AgriSmart safety rules → command`. Nothing added
by this workstream touches `commandsService` or
`irrigationService.openValve/closeValve` —
`tests/ai/safetyBoundary.test.js` (still passing, untouched) continues
to prove this by mock + source-scan.

## 14. Tests

16 suites / 70 tests, all passing
(`npx cross-env NODE_ENV=test jest --config jest.offline.config.js tests/ai`),
covering: dataset adapters, unit normalization, temporal normalization,
provenance schema, canonical schema (dataSource separation), the
canonical bridge, the quality engine, leakage guards, the benchmark
runner's honesty gating, model registry lifecycle (candidate →
validated → active → retired, invalid-transition rejection), and OOD
detection — in addition to the first workstream's 7 suites / 22 tests,
unchanged and still passing.

## 15. Failures (reported, not hidden)

- Real dataset ingestion failed outright — network egress blocked;
  `WebFetch` refused by target `robots.txt`. Reported in §3 and in
  `ai/external/README.md`.
- Both external fixtures are too small to clear even the 30-example
  smoke-test floor for irrigation-need prediction — expected for
  hand-built structural fixtures, and correctly reported as
  `INSUFFICIENT_DATA` rather than forced through.
- Cross-dataset generalization could not be measured for the reason
  above — this is this workstream's single biggest open gap.

## 16. Known limitations

- No real dataset has been ingested; every "external" result in this
  repository is a pipeline-correctness proof, not agricultural
  evidence.
- Only two adapter formats exist (SCAN-style, generic flat IoT CSV) —
  the other four cataloged datasets have no adapter written yet.
- Cross-dataset domain-shift reporting is structural
  (field-by-field comparison) with no quantitative shift metric —
  deliberately, since inventing a "shift score" without real data on
  both sides would itself be a fabrication.
- Water-volume/duration-recommendation and irrigation-response
  modeling (spec Tasks 11/13/14) were NOT implemented this session:
  no available dataset (real or fixture) contains water-volume data,
  so per the spec's own instruction ("if a dataset lacks a required
  feature... mark the task as DATA INSUFFICIENT"), these remain
  interface-only. `ai/external/schemas/canonicalRecord.schema.js`
  already has `waterVolumeLiters` as a field precisely so a future real
  dataset can populate it without a schema change.
- Ensemble modeling, transfer-learning fine-tuning, and deep
  sequence models were not attempted — no dataset here has the volume
  to justify them (consistent with the spec's own "do not jump directly
  to deep learning" instruction).

## 17. Real telemetry still needed

Unchanged from the first workstream's `ai/DATA_READINESS.md`: ≥3
devices, ≥30 days each, realistic ~15-30 min cadence. Additionally, for
this workstream's goals specifically: at least one REAL external
dataset actually downloaded (Mendeley tomato-irrigation dataset, entry
5 in `DATASETS.md`, is the best current candidate) so a genuine
cross-dataset generalization study can finally be run.

## 18. Reproduce

```
cd agrismart-backend
npm run bench:run -- --dataset=scan-network-fixture
npm run bench:run -- --dataset=generic-iot-agri-fixture
npm run bench:run -- --dataset=agrismart-synthetic-dev
npm run bench:cross -- --train=agrismart-synthetic-dev --test=generic-iot-agri-fixture
npx cross-env NODE_ENV=test jest --config jest.offline.config.js tests/ai
```
Reports land in `ai/external/reports/*.json` (gitignored, regenerate
on demand); the experiment log is `ai/external/experiments/log.jsonl`.

## Recommended next research milestone

**Get one real dataset's actual bytes into this repository** (from an
environment with normal internet access) — the Mendeley tomato
irrigation dataset first, since it is the only catalog entry claiming
both sensor and irrigation data. Everything downstream (adapter,
quality report, leakage-checked benchmark, and finally a real
cross-dataset comparison against AgriSmart's own eventual field
telemetry) is already built and tested to receive it.
