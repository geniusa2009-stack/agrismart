# AgriSmart AI — External Dataset & Benchmarking Subsystem

A THIRD, separate workstream from both the core MVP (`src/`) and the
first AI workstream (`ai/data`, `ai/training`, etc., which only ever
touches AgriSmart's own real-or-synthetic-dev telemetry). Nothing here
writes to AgriSmart's production `Telemetry`/`IrrigationEvent`
collections, and nothing here can be reached by any actuation path.

## Environment constraint (read this first — it shapes everything below)

This subsystem was built to ingest real public agricultural datasets.
**In this execution environment, that turned out to be impossible**,
and this is reported honestly rather than worked around:

- Direct HTTP(S) requests to any host outside a narrow package-registry
  allowlist (npm/PyPI/crates/JSR/Go proxy + Anthropic's own API hosts)
  are rejected at the network gateway with `403` — verified against
  `raw.githubusercontent.com` and `zenodo.org` from BOTH the cloud
  workspace and the user's own linked machine.
- The `WebFetch` tool (routes through a different, Anthropic-operated
  fetch path) reached `archive-api.open-meteo.com` but was refused by
  that API's own `robots.txt`, and a prior attempt at the same URL hit
  an unanswered interactive-approval timeout. Neither path yields raw,
  byte-exact external data in this environment.

**Consequence**: no dataset in `DATASETS.md` has actually been
downloaded and ingested with real values in this repository. Every
concrete adapter below (`adapters/scanNetworkAdapter.js`,
`adapters/genericIotCsvAdapter.js`) is real, tested code, but it has
only ever been exercised against a small, explicitly-labeled
**structural fixture** (`adapters/fixtures/*.csv`) — a handful of rows
shaped exactly like the real dataset's own documented column layout,
built to prove the *parser* works, never claimed to be, or treated as,
real observations. Every fixture-derived record carries
`dataSource: 'external'` in its provenance ONLY in the sense of "this
adapter targets an external dataset schema" — the `ingested: false`
flag on every fixture's provenance record is what actually tells the
truth, and every report generator in this subsystem checks that flag
before it will call a result "real external data."

If you are reading this in an environment with normal internet access:
drop the real dataset file(s) into `ai/external/adapters/fixtures/real/`
(gitignored) and re-run `npm run bench:run -- --dataset=<id>` — the
adapters do not need to change, only the fixture path does. See
`DATASETS.md` for exactly which file(s) each adapter expects.

## Architecture

```
external dataset file (real, when available; fixture otherwise)
        -> adapters/<name>Adapter.js        (parse + provenance)
        -> schemas/provenance.schema.js      (validated, never discarded)
        -> normalization/units.js            (explicit, tested conversions)
        -> normalization/temporal.js         (timezone, resampling, gaps)
        -> schemas/canonicalRecord.schema.js (common research schema)
        -> quality/qualityEngine.js          (INFO/WARNING/ERROR/CRITICAL report)
        -> leakage/leakageGuards.js          (shared with ai/features — same rules)
        -> benchmark/datasetRegistry.js      (catalog: AgriSmart real/synthetic + external)
        -> benchmark/runBenchmark.js         (feature engineering -> existing ai/ model + baselines -> metrics)
        -> benchmark/crossDatasetReport.js   (train on A, test on B, measure domain shift)
        -> experiments/experimentLog.js      (hypothesis/dataset/features/split/model/metrics/conclusion)
```

## Non-negotiables enforced in code, not just docs

- `dataSource` on every canonical record is one of
  `'external' | 'agrismart_real' | 'synthetic_dev'` — enforced by
  `schemas/canonicalRecord.schema.js`, never inferred implicitly.
- Every adapter's provenance record is validated by
  `schemas/provenance.schema.js` and required to include an
  `ingested: boolean` field — `false` for every fixture in this
  repository today.
- `leakage/leakageGuards.js` throws (not warns) if a benchmark run
  is given features computed from data after the label's `asOf`, or if
  the same timestamp appears in both a train and test split for the
  same dataset+entity — this is the "fail loudly" requirement.
- `benchmark/crossDatasetReport.js` refuses to compute a generalization
  score between two datasets unless both have `ingested: true`
  provenance — with only fixtures available, it runs in
  `mode: 'infrastructure-selftest'` and labels every number it prints
  as non-transferable, rather than silently producing a report that
  looks like a real cross-dataset study.
