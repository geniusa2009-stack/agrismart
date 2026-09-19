# Pending real dataset staging

This folder is a placeholder for the real dataset file(s) the user is downloading
manually and attaching to the chat session.

Dataset expected here:
- Name: "Dataset on irrigation for Tomato"
- Source: Mendeley Data
- DOI: 10.17632/33cngpcrmx.2
- URL: https://data.mendeley.com/datasets/33cngpcrmx/2

## Why this folder exists

Neither this device's isolated VM nor the cloud container executing this session
has usable network egress to Mendeley (confirmed by direct diagnostic tests —
see `AI_TRAINING_REPORT.md` once produced, and `ai/external/README.md` for the
general network-constraint writeup). The user is downloading the dataset
themselves and attaching the file(s) directly to the chat instead.

## What happens once the file is attached

1. The attached file will land in the AI assistant's cloud workspace (its
   `uploads` directory), NOT automatically in this folder or anywhere on this
   machine.
2. The assistant will read the real file there, inspect its actual columns/
   headers/units, and only then decide how to map it into the canonical schema
   (`ai/external/schemas/canonicalRecord.schema.js`).
3. The mapping will most likely be done via `ai/external/adapters/genericIotCsvAdapter.js`,
   which was generalized specifically for this (see its `meta` parameter) so a
   dataset-specific adapter file is not required unless the real file's shape
   turns out to need custom parsing (e.g. multi-sheet layout, non-CSV format,
   non-tabular structure). If a bespoke adapter is needed instead, it will be
   added next to this folder, not inside it.
4. A **copy** of the real, attached file will be placed in this folder
   (`ai/external/adapters/pending/`) for provenance/reproducibility once it has
   been inspected and ingestion begins — so there is a durable, on-disk record
   of exactly which bytes were used to train the model, alongside the license/
   citation details captured in the dataset's `provenance` object
   (`ingested: true`, `datasetId`, `datasetName`, `source`, `url`, `doi`,
   `license`, etc.).
5. Nothing in this folder is treated as real/ingested data until a human
   (the user) has actually supplied the file — this README and an empty
   folder are not a substitute for the real dataset, and no training or
   accuracy claim will be made from placeholder content here.

## What must NOT happen

- The 5 manually inserted MongoDB Atlas demo telemetry readings must never be
  treated as "the real dataset." They remain development/demo data only,
  and are structurally excluded from ever being certified as a trained
  "real" model by `MIN_REAL_EXAMPLES = 500` in `ai/training/train.js`.
- Synthetic-dev data must never be blended into this dataset's records or
  presented as if it came from the real source.
- No model accuracy, readiness, or production claims will be made until the
  actual dataset file has been inspected, ingested, quality-checked, and
  evaluated end-to-end.
