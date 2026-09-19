# AgriSmart AI — External Dataset Catalog

Every entry below was identified through web research (dates reflect
when this catalog was compiled: September 2026) and is documented in
good faith from publicly available descriptions. **None of these
datasets has actually been downloaded into this repository** — see
"Ingestion status" per entry and `ai/external/README.md` for why
(network egress to any non-package-registry host is blocked in this
execution environment, verified with a live `403` from both the cloud
workspace and the linked development machine).

## 1. USDA NRCS Soil Climate Analysis Network (SCAN)

- **Source**: U.S. Department of Agriculture, Natural Resources
  Conservation Service
- **URL**: https://www.nrcs.usda.gov/resources/data-and-reports/soil-climate-analysis-network
- **License**: U.S. Government work — generally public domain within
  the US; verify per-station/derivative terms before redistribution
- **Location**: Multiple fixed stations across the continental USA,
  Alaska, Hawaii, Puerto Rico
- **Crop**: None — SCAN stations are climate/soil monitoring
  installations, not tied to a managed crop
- **Variables**: Soil moisture (volumetric %) and soil temperature at
  multiple depths (typically 2in/4in/8in/20in/40in), air temperature,
  precipitation; some sites add solar radiation, wind, relative
  humidity
- **Sampling**: Sub-hourly native logging; hourly/daily report exports
  commonly used for analysis
- **Time period**: Many stations have 15-25+ years of continuous
  record
- **Size**: Large (decades × hundreds of stations) if bulk-downloaded
- **Quality**: Generally high — a maintained federal monitoring
  network with documented QA/QC, though individual sensor faults occur
  like any field deployment
- **Limitations**: No irrigation event data, no EC/salinity in the
  standard report format, no crop or soil-type metadata in the sensor
  export itself (soil survey data exists separately and would need to
  be joined by station location)
- **Suitable tasks**: Soil moisture forecasting (strong candidate —
  long, continuous, real field records); NOT suitable alone for
  irrigation-need classification (no irrigation ground truth) or
  anomaly-vs-agricultural-outcome analysis
- **Ingestion status**: **NOT ingested.** `ai/external/adapters/scanNetworkAdapter.js`
  parses this format and is tested against
  `fixtures/scan_network_structural_fixture.csv`, a small hand-built
  file matching SCAN's documented report-export column layout — not
  downloaded real station data.

## 2. Kaggle — "IoT Agriculture 2024"

- **Source**: Kaggle (uploader: wisam1985)
- **URL**: https://www.kaggle.com/datasets/wisam1985/iot-agriculture-2024
- **License**: Per Kaggle dataset page (verify the specific license
  badge at time of download — not independently confirmed here)
- **Location / crop / soil**: Not confirmed without downloading
- **Variables**: IoT sensor readings (moisture/temperature/humidity
  typical of this dataset family per its title and category)
- **Suitable tasks**: Candidate for irrigation-need classification and
  multi-sensor fusion experiments IF it includes an irrigation/valve
  column — must be verified on download, not assumed
- **Ingestion status**: NOT ingested; NOT adapted by a dedicated
  parser yet. `ai/external/adapters/genericIotCsvAdapter.js`'s
  configurable column-mapping design is intended to fit this dataset
  family once a real file is available — the exact `columnMap` would
  need to match whatever column names this specific file actually uses.

## 3. Kaggle — "Soil Moisture data from field scale sensor network"

- **Source**: Kaggle (uploader: sathyanarayanrao89)
- **URL**: https://www.kaggle.com/datasets/sathyanarayanrao89/soil-moisture-data-from-field-scale-sensor-network
- **License**: Per Kaggle dataset page (verify at download time)
- **Variables**: Field-scale soil moisture sensor network readings
  (multiple sensors across a field, per the title)
- **Suitable tasks**: Soil moisture forecasting; potentially
  multi-sensor spatial fusion (multiple sensor locations within one
  field) — an experiment this repository's current single-entity
  benchmark does not yet exploit
- **Ingestion status**: NOT ingested; no dedicated adapter written
  (would likely fit `genericIotCsvAdapter.js`'s shape, pending column
  verification).

## 4. Mendeley Data — "Smart Agriculture and Plant Health Monitoring using IoT"

- **Source**: Mendeley Data (a curated open-data repository; Mendeley
  datasets are typically published under a Creative Commons license,
  most often CC BY 4.0 — verify the specific license tag on the
  dataset page)
- **URL**: https://data.mendeley.com/datasets/65jxyrxv7b/1
- **Variables**: IoT sensor readings for plant health / smart
  agriculture monitoring (soil + ambient sensors, per its title)
- **Suitable tasks**: Multi-sensor fusion, anomaly detection
- **Ingestion status**: NOT ingested; no dedicated adapter written.

## 5. "Dataset on irrigation for Tomato" (Mendeley Data, primary source — UPDATE: now ingested)

- **Source**: Mendeley Data (primary, directly confirmed — supersedes
  the earlier iotdataset.com mirror entry this catalog originally
  listed here)
- **URL**: https://data.mendeley.com/datasets/33cngpcrmx/2
- **DOI**: 10.17632/33cngpcrmx.2 (version 2, published 13 Nov 2024)
- **License**: NOT specified in the page content retrievable by this
  project as of ingestion — treat as unconfirmed/all-rights-reserved
  until directly verified on the Mendeley page.
- **Crop**: Tomato
- **Variables (confirmed by direct inspection of the real file, not
  just the page description)**: temperature, humidity, soil moisture,
  reference evapotranspiration, evapotranspiration, crop coefficient +
  growth stage, soil N/P/K, solar radiation, wind speed, days since
  planting, soil pH. **No irrigation decision/valve/pump signal and no
  timestamp of any kind** — the mirror site's earlier claim of
  "irrigation information" was NOT confirmed once the real file was
  actually inspected; see AI_TRAINING_REPORT.md Section 1.
- **Suitable tasks actually supported**: concurrent soil-moisture
  estimation from other concurrent readings (a virtual-sensor /
  sensor-fusion regression). NOT irrigation-need prediction or
  irrigation-response modeling — those would require an irrigation
  signal this file does not contain.
- **Ingestion status**: **INGESTED.** The user downloaded the file
  directly from Mendeley and attached it to the project; it was copied
  byte-for-byte (SHA-256 verified) into
  `ai/external/adapters/pending/tomato_irrigation_dataset.csv` and
  trained on via `ai/training/tomato/train.js`
  (`npm run ai:tomato:train`). Full results, data-quality findings,
  and the (negative) outcome are in `AI_TRAINING_REPORT.md` — the
  trained model did not beat its baselines and remains an unvalidated
  `candidate` in the model registry.

## 6. Open-Meteo Historical Weather Archive API

- **Source**: Open-Meteo (open-source, no API key required)
- **URL**: https://open-meteo.com/ (archive endpoint:
  `archive-api.open-meteo.com/v1/archive`)
- **License**: Open-Meteo states its weather data is free for
  non-commercial and commercial use with attribution (verify current
  terms at time of use — not re-verified here beyond the initial
  search)
- **Variables**: Air temperature, relative humidity, precipitation,
  soil temperature and soil moisture at several depths, solar
  radiation, wind — for any latitude/longitude, historical archive back
  decades
- **Suitable tasks**: Weather-context enrichment for AgriSmart's own
  real telemetry once it exists (Task 23's weather abstraction) —
  this is the natural free source for that interface
- **Ingestion status**: **Attempted and failed in this environment.**
  A direct `WebFetch` call to the archive endpoint was refused by the
  API's own `robots.txt` policy, and a prior interactive-approval
  request for the same URL went unanswered before timing out. No
  adapter has been written against real Open-Meteo output; the JSON
  response shape is well-documented publicly and an adapter could be
  written once real bytes are obtainable.

## 7. IoT Dataset from an Evolving Tomato Cultivation Testbed (Mendeley/University of Parma — INGESTED and MODELED this phase)

- **Source**: University of Parma IoT Laboratory / Azienda
  Sperimentale Stuard, Italy. Companion single-season publication:
  Belli et al., *Data in Brief* 60 (2025) 111521, DOI
  `10.1016/j.dib.2025.111521`, Mendeley `35wh56287y` — this specific
  multi-year (2023/2024/2025) bundle's own DOI/URL was searched for and
  NOT confirmed; recorded as `null`, not guessed (see
  `AI_DATASET_INVENTORY.md`).
- **Ingestion status**: **Ingested and modeled.** Real per-line
  (5 lines), per-10-minute LoRaWAN sensor data across 3 seasons, with
  REAL valve open/close ground truth (unlike every other dataset in
  this catalog). Used to train `irrigation_event_next_1h` (2024 primary
  training + in-season test; 2025 fully external validation, no
  retraining). Result: negative — did not meet this project's
  validation criteria on either evaluation. Full detail in
  `AI_TRAINING_REPORT.md`, `AI_DATA_QUALITY_REPORT.md`,
  `AI_ABLATION_REPORT.md`.
- **Files committed**: `ai/external/adapters/pending/evolving-tomato-testbed/{2023,2024,2025}/`.

## 8. IoT-based Dataset of a Tomato Cultivation Under Different Irrigation Regimes ("STUARD") — REJECTED (full forensic audit complete)

- Same site/research group as #7; its single 2023 season's exact date
  range and device GPS coordinates match #7's own `2023/` folder,
  making it non-independent (very likely the same underlying data).
  No valve/irrigation stream exists in this dataset at all. FULL
  re-audit (final phase): exact row counts verified for all 4 files;
  a SECOND header-duplication defect found in `stuard_water_meter_data.csv`
  (previously only found in `stuard_soil_data.csv`); cumulative
  water-meter volume verified monotonic except 3 anomalous decreases
  in one line. See `AI_DATASET_INVENTORY.md` and `AI_DATA_QUALITY_REPORT.md`.

## 9. 9-Year Industrial Tomato Agro-physiological Dataset — CONTEXT-ONLY (corrected characterization)

- **Correction:** an earlier pass in this project characterized this
  as "~9 independent season-rows" without opening the file. Having
  now actually opened it: it is a real, well-documented, 8-sheet
  workbook with 32 distinct experiment-year x irrigation-regime
  combinations (9 calendar years, 2005-2018 with a real 2007-2011
  gap), 949 rows of real daily weather, 524 rows of REAL irrigation
  event dates and water volumes (mm) — the earlier claim of "no
  irrigation stream" was also wrong — and 188 rows of real crop-water-
  stress-index (CWSI) physiology measurements. Still not modeled this
  phase: 32 experiment-groups remains too few for a defensible
  held-out split against this project's current targets, but this is
  a more specific and more accurate reason than the original
  "too few season-rows" characterization. See `AI_DATASET_INVENTORY.md`.

## 10. AgriDataValue / Open-Meteo environmental dataset — CONTEXT-ONLY (now actually opened and verified)

- Previously catalogued only from a generic web search, without ever
  opening the actual attached file. Now opened and verified: 5 real
  xlsx files (2 on-site "BIORO" weather-station exports, 3 Open-Meteo
  ERA5 hourly exports explicitly for a **corn** site). Confirmed: no
  irrigation/valve/tomato-specific signal in any file — the prior
  phase's inference was directionally correct even though it had
  never opened the bytes. See `AI_DATASET_INVENTORY.md`.

## 11. Soil Moisture, Irrigation Actuator and Weather Dataset (Arnesano, Apulia, Italy, 2025) — INGESTED and MODELED

- Real, single-season (Feb-Sep 2025), 5-sector, 4-crop-type (tomato
  open-field x2, potted tomato, zucchini, blueberry) precision-
  irrigation field trial. Real valve telemetry, 789 reconstructed
  irrigation/fertigation events, real applied water volume, soil
  EC/pH/moisture, ERA5 weather. Used to train
  `arnesano_soil_moisture_24h_forecast` (zones 1/2/4 training, zone 5
  cross-crop validation, zone 3 rejected for data quality). Result:
  narrowly beats a strong persistence baseline in-distribution
  (R^2 0.9927 vs. 0.9923) but loses to it on the held-out crop
  (R^2 0.8765 vs. 0.8808) — `candidate`, not promoted. Full detail in
  `AI_TRAINING_REPORT.md`, `AI_DATA_QUALITY_REPORT.md`,
  `AI_ABLATION_REPORT.md`.

## What this catalog does NOT include

No dataset above was rejected as low-quality without checking — this
is a first-pass catalog from search results, not an exhaustive survey.
Notably NOT investigated in depth: AmeriFlux/FLUXNET (eddy-covariance
climate/soil towers, likely useful for the weather side), TERRA-REF
(high-resolution phenotyping, likely too specialized), and any
national-scale remote-sensing soil moisture product (SMAP/SMOS-derived
— these are satellite-retrieved, not in-situ IoT sensor data, so a
poor match for AgriSmart's ground-sensor use case specifically).

## Reproducing this catalog / extending it

Re-run the same research with:
```
WebSearch: "open dataset soil moisture irrigation IoT sensors timestamps license CSV Zenodo Kaggle"
WebSearch: "USDA SCAN Soil Climate Analysis Network data download soil moisture temperature hourly"
```
