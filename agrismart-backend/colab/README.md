# AgriSmart Colab Training Workspace

This folder contains the Colab-based experiment/training environment for
AgriSmart's real-data AI research, per the "move ML experimentation to
Colab" directive. **The `agrismart-backend` repository remains the
source of truth** for schemas, adapters, feature definitions, the model
registry, inference contracts, and safety boundaries — this notebook
*reuses* that architecture (it does not invent new targets, features,
splits, or safety rules) and gives the actual model-fitting work access
to Colab's compute and Python's ML toolkit (scikit-learn, XGBoost,
LightGBM, Optuna) instead of the repo's dependency-light Node
implementation.

## Files

- `AgriSmart_Colab_Training_Workspace.ipynb` — the notebook itself.
  Upload to https://colab.research.google.com (File → Upload notebook)
  and run top to bottom.

## What it reuses from the repo (not reinvented)

| Repo file | Ported to |
|---|---|
| `ai/training/arnesano/*` | Pipeline 1 (24h soil-moisture forecast) |
| `ai/training/evolvingTomato/*` + `ai/features/featureEngineering.js` | Pipeline 2 (irrigation-event-next-1h) |
| `ai/training/tomato/*` | Pipeline 3 (concurrent soil-moisture estimate) |
| `ai/external/leakage/leakageGuards.js` | Shared leakage-guard functions |
| `ai/models/modelRegistry.js` | Model-artifact JSON shape + candidate-first status lifecycle |
| `ai/inference/outOfDistribution.js` / `ai/training/*/outOfDistribution.js` | OOD + confidence-tiering |
| `AI_DATASET_INVENTORY.md` / `AI_TARGET_CATALOG.md` | Dataset roles + target-selection table (Phases 2 and 4) |

## Workflow

1. Open the notebook in Colab and run Phase 1 (environment setup).
2. In Phase 2, upload the real, already-audited dataset CSV/XLSX files
   (see the dataset table in that phase for exact expected filenames —
   these are the same files already in the repo's
   `ai/external/adapters/pending/` tree). **Never upload
   `synthetic_dev` fixtures or anything shaped like the 5 manually
   inserted Atlas demo readings** — both are structurally rejected if
   you try.
3. Run every cell top to bottom. Each phase prints what it decided and
   why; Phase 17 prints an explicit PASS/FAIL/BLOCKED per test.
4. When finished, download (or Drive-sync) the whole
   `/content/agrismart_ai/` folder. It contains:
   - `reports/AGRISMART_COLAB_TRAINING_REPORT.md` — the full report,
     generated entirely from that run's own computed variables.
   - `reports/experiment_results.csv`, `reports/model_manifest.json`,
     `reports/model_card.md`, `reports/dataset_provenance.json`.
   - `models/<target>.pipeline.joblib` + `models/<target>.v1.json` —
     one artifact pair per trained target.
   - `integration_package/` — a reference (Python) inference wrapper,
     an example input/output pair, and version metadata, for a human
     reviewer to compare against the repo's real `ai/inference/*.js`
     contract before anything is ported back.

## Copying results back into the repo

Nothing here writes to the repo automatically (by design — there is no
network path from this notebook into AgriSmart's backend or database).
To bring a run's results back:

1. Copy `models/<target>.v1.json` + `.pipeline.joblib` files somewhere
   a human reviews them alongside `ai/models/artifacts/` — they are
   **not** auto-promoted; `status` is always `"candidate"` in the saved
   JSON, matching the repo's own `modelRegistry.js` discipline.
2. Compare `reports/AGRISMART_COLAB_TRAINING_REPORT.md`'s per-target
   sections against the repo's existing `AI_TRAINING_REPORT.md` /
   `AI_MODEL_CARD.md` and merge in any genuinely new findings (e.g. a
   tree-based model beating the repo's Ridge/logistic baseline) — do
   not overwrite the repo's own audit trail, add to it.
3. If a model's governance verdict changes as a result (e.g. a
   Colab-trained Random Forest clears a gate the repo's Ridge model
   didn't), that promotion decision is still a deliberate, human-
   reviewed step in the repo — this notebook cannot and does not make
   that call for you.

## Safety

Every run's Phase 17 includes source-scan tests
(`safety_scan_integration_wrapper`, `safety_scan_notebook_functions`,
`integration_wrapper_is_pure_no_network_calls`) proving no code path in
this notebook or its generated integration package calls, imports, or
references a valve/actuator/command API. AI output from this workspace
is advisory-only, exactly as in the repo.
