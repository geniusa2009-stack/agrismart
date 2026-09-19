# AI Target Catalog

Status date: 2026-09-11. Every candidate ML target considered across
both datasets this phase, with an explicit accept/reject rationale.
Rule 12 in force throughout: no target is described as "irrigation
control" unless it maps to an actual, defensible irrigation-relevant
outcome variable that genuinely exists in the source data.

| Target | Dataset | Status | Rationale |
|---|---|---|---|
| `tomato_soil_moisture_estimate` (regression: current soil moisture from concurrent env/agronomic readings) | #1 | Modeled (prior phase) — negative result, `candidate` | Dataset #1 has no irrigation/valve label of any kind; this was the strongest defensible target given its actual columns. Failed validation (R² = -0.013). |
| `irrigation_event_next_1h` (binary: will a NEW irrigation event START within the next hour) | #2 | Modeled (this phase) — negative result, `candidate` | Dataset #2 has REAL valve-actuation ground truth, making this the first target in the project with a genuine irrigation-decision outcome variable. Failed validation both in-season (2024) and externally (2025) — see `AI_TRAINING_REPORT.md`. |
| `irrigation_event_next_1h` (persistence variant: valve open at ANY point in the next hour) | #2 (Python prototype only) | Rejected as the FINAL target; documented only as a comparison point | Easier, dominated by already-ongoing irrigation; less operationally useful (doesn't help decide whether to START irrigation) and conflates "still running" with "about to start." Kept only in `AI_ABLATION_REPORT.md`/`AI_DATA_QUALITY_REPORT.md` as an explanation for the Python-vs-Node metric gap, never registered as a model. |
| Irrigation *duration/volume* prediction | #2 | Not attempted | Dataset #2 does record valve open/close timestamps (duration is derivable) but the training report's scope this phase was intentionally limited to the single onset-classification target once it failed validation, per the "do not force success by adding more targets" principle — spreading effort across additional untested targets on an already-negative dataset was judged less valuable than fully, honestly documenting the one target actually tried. |
| Any target from STUARD (#3) | #3 | Rejected | No irrigation/valve stream exists in this dataset at all; same-site/date overlap with #2's 2023 season also disqualifies it as an independent validation set even for a soil-only target. |
| Any target from the 9-Year Industrial dataset (#5) | #5 | Rejected | n ≈ 9 independent season-rows; cannot support a leak-free split (rule 9/16). |
| Any target from AgriDataValue/Open-Meteo (#6) | #6 | Rejected | No irrigation/valve/tomato-specific signal; different crop context. |

## Why no additional targets were invented to "rescue" a negative dataset
Per the user's explicit rule ("do not force a model just to declare
success" / "if NO model is adequately validated, that is an acceptable
result"), once `irrigation_event_next_1h` failed its own dual-condition
validation gate, the response was to investigate WHY (seasonal
non-stationarity, onset-vs-persistence task difficulty — see
`AI_DATA_QUALITY_REPORT.md`) and document that honestly, not to
iterate through arbitrary alternative target definitions on the same
data until one happened to clear the bar. The ablation study (below)
was run to characterize the failure, not to search for a flattering
reformulation.

---

# Batch 1 (new phase) — Comparative target suitability: Evolving Tomato Testbed vs. Arnesano Precision-Irrigation Dataset

Status date: 2026-09-11. Neither dataset was trained on this turn
(audit-only, per explicit instruction). This section is a provisional
suitability judgment to inform (not pre-empt) target selection once
remaining batches arrive and merging/training decisions are actually
made.

| Task | More suitable dataset | Why |
|---|---|---|
| Soil-moisture forecasting (N-steps/hours ahead) | **Arnesano** | Already has an engineered, mostly-leak-free 24h-ahead target construction (verified: `target_point_24h` = `soil_moisture.shift(-144)`, 100% match), 5 zones x 4 crop types under identical weather forcing for cross-sector generalization, and richer concurrent features (pH, EC, indoor/outdoor + ERA5 weather). Caveat: the "24h" framing is unreliable in 4/5 zones (see `AI_DATA_QUALITY_REPORT.md` Finding 1) and MUST be rebuilt from the merged (not preprocessed) layer with a true wall-clock lookup before this advantage is real. |
| Irrigation-demand prediction (should irrigation happen soon, from soil/weather state) | **Arnesano** | `stop_reason`/`initial_humidity`/`final_humidity` per event plus per-sector agronomic thresholds (PWP/MADP/FC/SP) give a directly interpretable "was this event agronomically well-timed" signal (`irrigation_optimal_start_percent` already computed per sector: see `sector_statistics_report.csv`) that Evolving Tomato's dataset does not have an equivalent for. |
| Irrigation EVENT prediction (onset — will a new event start in the next N minutes/hours) | **Evolving Tomato Testbed** (already attempted, negative result) | It has TWO independent seasons (2024/2025) for a genuine external-season validation, which Arnesano (single season) cannot offer on its own. Arnesano's 789 events (vs. Evolving Tomato's much larger raw sample) is a smaller absolute label count for a rare-event task, though its multi-crop, multi-threshold structure may make onset more learnable per-sector — untested, not yet run. |
| Water-volume prediction | **Arnesano** | Real, measured nominal-flow-rate-derived liters, both backward-looking (`water_vol_past_4h`, safe) and forward-looking (`water_vol_to_24h`, explicitly flagged as leakage-prone by the dataset's own documentation and confirmed by this project's own leakage checks). Evolving Tomato Testbed has no water-volume field ingested (only irrigation duration is derivable; a separate water-meter stream exists in that dataset's source but was not ingested — see prior phase's `AI_DATASET_INVENTORY.md` entry #2). |
| Valve-state / actuator-state prediction | **Tie, different strengths** | Evolving Tomato Testbed: cleaner binary open/closed signal, already has a working (if unvalidated) end-to-end pipeline. Arnesano: richer state space (irrigation valves AND a shared 4-channel fertigation unit; `is_raw` observed-vs-inferred flag lets a future adapter distinguish "actually observed" from "platform-inferred" valve state, which the Evolving Tomato adapter cannot do since its source data doesn't carry that distinction). |
| Anomaly detection (sensor faults, flatlines, implausible values) | **Arnesano** | Provides the richest, most heterogeneous fault taxonomy of any dataset audited so far: multi-week flatlines (up to ~59 days in zone 3), signed-16-bit-integer overflow sentinel values in EC/pH, and an explicit is_raw observed-vs-inferred distinction in BOTH the actuator and sensor raw streams — genuinely more anomaly variety than Evolving Tomato Testbed's two documented defects (off-season pollution, 3 implausible soil-moisture rows). |

## Provisional dataset roles (subject to revision once remaining batches arrive — rule 6/11: no merging without a specific justification)

| Dataset / subset | Provisional role |
|---|---|
| Arnesano zones 1, 2, 4 (open-field tomato x2, zucchini) | **Provisional PRIMARY TRAINING** candidates for soil-moisture-forecasting / water-volume tasks — best combination of coverage length and data quality. |
| Arnesano zone 5 (blueberry) | **Provisional VALIDATION** (within-dataset cross-crop generalization check — same site/weather, different crop/substrate, as the dataset's own README explicitly invites) — NOT external, since it shares the same season/site/instrumentation as zones 1/2/4. |
| Arnesano zone 3 (potted tomato) | **Provisional CONTEXT-ONLY / candidate OOD case study** — disqualified from primary train/validation roles by Finding 3 in `AI_DATA_QUALITY_REPORT.md` (worst flatline, worst EC/pH error rate of any zone); may still be useful later specifically as an anomaly-detection or robustness test case, not as a clean training signal. |
| Arnesano raw actuator/sensor layer (`01_raw_data/`) | **Provisional CONTEXT-ONLY for now** — the processed layer already reconstructs everything currently needed and was verified to match the raw layer's own documented statistics; re-deriving directly from raw would duplicate already-verified work without a specific modeling justification (rule 6). May become directly relevant later specifically because it is closer in nature to what AgriSmart's own LIVE telemetry would look like (noisy, `is_raw`-flagged) than the already-cleaned merged/preprocessed layer. |
| Evolving Tomato Testbed (2024/2025) | **Unchanged from prior phase** — 2024 training + in-season test, 2025 external validation. Additionally now a **provisional cross-dataset OOD/robustness reference** relative to any future Arnesano-trained model (different country, different crop, different irrigation-controller logic) — NOT proposed for merging with Arnesano under any current plan. |
| STUARD, 9-Year Industrial, AgriDataValue/Open-Meteo | **Unchanged from prior phase** — context-only/rejected, as previously documented. |

No merge across Arnesano and Evolving Tomato Testbed is planned or performed. Both remain independently tracked datasets pending the user's remaining batches.

---

# Final target selection — all candidate AgriSmart ML tasks evaluated across all real datasets

Status date: 2026-09-11

| # | Candidate target | Exact label/target | Dataset(s) | Horizon | Usable n | Feature availability at prediction time | Leakage risk | Practical AgriSmart usefulness | Cross-dataset compatibility | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Soil-moisture forecasting | Soil moisture % at t+24h | Arnesano (zones 1/2/4 train, zone 5 validate) | 24h (true wall-clock, rebuilt from the regular grid — see AI_SPLIT_PROTOCOL.md) | 22,722 pooled training examples, 9,444 zone-5 validation examples | All features (weather, current soil state, backward-looking water) available in real time | Low — rebuilt target is provably leak-free (unit-tested); persistence baseline is the real risk (a naive model can "cheat" by nearly copying the input) — measured and reported honestly | High if it ever clears its own bar: 24h soil-moisture forecasts are directly actionable for irrigation scheduling | Feature sets are NOT compatible with Evolving Tomato Testbed (Arnesano has EC/pH/ERA5-weather; Evolving Tomato does not) — no literal cross-dataset transfer attempted (would require fabricating sensor equivalence) | **SELECTED — trained this phase.** Model beats both baselines in-distribution (R^2 0.9927 vs. persistence 0.9923) but does NOT beat persistence on the cross-crop zone-5 validation (R^2 0.8765 vs. 0.8807) — `candidate`, not promoted. |
| 2 | Irrigation-demand prediction | Agronomic "should irrigate soon" state (moisture crossing below a per-crop threshold) | Arnesano (thresholds documented per sector), Dataset #1 (workstream-1-era, synthetic-derived) | Varies | Arnesano: derivable from the same merged layer; not separately trained this phase (time/scope) | Real per-sector thresholds exist (PWP/MADP/FC/SP) — genuinely more defensible than Dataset #1's original synthetic-era threshold rule | Same as #1 — reuses the leak-free feature/label machinery already built | High — directly maps to an actionable advisory ("moisture is approaching the sector's own stress threshold") | Arnesano's per-sector thresholds are dataset-specific (calibrated to ITS soil model); not portable to AgriSmart's own soil without AgriSmart's own soil-model calibration | Not trained this phase — flagged as the most natural NEXT target once #1's forecast head exists, since it can reuse the same feature pipeline with a different label function |
| 3 | Irrigation-event prediction (onset) | Will a NEW irrigation event start in the next N minutes | Evolving Tomato Testbed (already attempted) | 1h (already trained) | 21,438 (2024) | Same AgriSmart-compatible feature set already used | Verified leak-free (existing tests) | High if validated — directly informs "should the system flag an imminent irrigation decision" | Arnesano ALSO has real event data (789 events) — a second, independent onset-classification attempt on Arnesano was considered but NOT run this phase (time-boxed: the soil-moisture-forecasting target was prioritized as the stronger, already-partially-validated candidate) | Already attempted on Evolving Tomato — negative result (unchanged, `candidate`). Arnesano variant: NOT YET ATTEMPTED — explicitly flagged as future work, not silently skipped. |
| 4 | Water-volume prediction | Liters applied over a future/past window | Arnesano (`liters_total`, `water_vol_past_4h`-style backward feature engineered directly by this project) | 4h backward (used as a FEATURE, not a target, this phase) | n/a as a target this phase | Real, measured (duration x nominal flow rate) | The dataset's OWN forward-looking `water_vol_to_24h` column is explicitly leakage-prone per its own documentation and this project's confirmation — NOT used as a feature or target in any model trained this phase | Would be directly useful (predicting how much water an irrigation decision will actually apply) | No equivalent measured-volume field exists in Evolving Tomato Testbed's ingested columns | Not trained as a standalone target this phase; the backward-looking variant is used only as an input FEATURE to target #1 |
| 5 | Valve-state prediction | Is the valve open right now / will it be open in the next bin | Evolving Tomato Testbed (already attempted, as onset); Arnesano (raw actuator stream available, not yet adapted) | Varies | See #3 | Same as #3 | Same as #3 | Medium — less operationally distinct from #3 (onset) unless framed as pure state-persistence, which this project's own prior forensics showed is an easier, less useful task (see AI_DATA_QUALITY_REPORT.md's onset-vs-persistence finding) | n/a | Not separately pursued — subsumed by #3's onset framing, which this project already judged the more useful formulation |
| 6 | Crop-response prediction | Yield/quality (Y_TOT, BRIX, etc.) as a function of irrigation regime + weather | 9-Year Industrial Tomato dataset | Full-season | 100 crop-outcome rows, 32 experiment groups | Weather + regime + soil texture all real and available; but only 32 independent experimental units to hold out from | Grouped split by experiment ID would be required — NOT attempted this phase | Long-term agronomic value (which regime maximizes yield/quality) but not an ONLINE/real-time AgriSmart advisory task | Single-site, single-cultivar — not portable to AgriSmart's own crop mix without recalibration | Not trained this phase — correctly re-scoped in AI_DATASET_INVENTORY.md as too thin an evidence base for this project's current infrastructure, not dismissed as impossible in principle |
| 7 | Water-efficiency prediction | Yield or CWSI per unit water applied | 9-Year Industrial Tomato dataset (`Irrigation` + `Crop` + `physiology` joined by experiment ID) | Full-season | Same 32-group limitation as #6 | Real | Same as #6 | High scientific value, low near-term AgriSmart operational value (this is a season-level agronomic-research question, not a per-device advisory) | Same as #6 | Not trained this phase — same reasoning as #6 |
| 8 | Anomaly / sensor-fault / leak detection | Flatlines, sentinel error-code values, implausible readings, valve-signal noise | Arnesano (richest fault taxonomy: ~59-day flatlines, signed-16-bit sentinel EC/pH values), STUARD (header-duplication artifacts), Evolving Tomato Testbed (off-season pollution, 3 implausible values) | n/a (detection, not forecasting) | n/a | The REJECTION RULES already implemented in every adapter this project has built ARE, in effect, a rule-based anomaly detector (documented plausibility-band checks) | None — this is detection, not forecasting, so no temporal leakage risk applies in the usual sense | High — a generalized version of these per-adapter rejection rules (sentinel-value detection, flatline-run-length detection, implausible-range detection) could become a reusable AgriSmart-side data-quality gate on LIVE telemetry, independent of any specific forecasting model | The rejection LOGIC (not the data) generalizes well across all three IoT datasets audited this phase | **Not trained as an ML classifier this phase** (no labeled anomaly ground truth exists in any dataset — labeling one would require inventing labels, which is against the rules) but the RULE-BASED version already exists, scattered across 3 adapters; recommended as a candidate for consolidation into a shared, reusable module in a future phase (see AGRISMART_REAL_DATA_COLLECTION_PLAN.md) |
| 9 | Any stronger target? | Considered: multi-output (soil-moisture + water-volume) forecasting; sequence models (RNN/LSTM) on Arnesano's regular grid | Arnesano | n/a | n/a | n/a | A more expressive model was considered and NOT pursued this phase: given persistence is already an R^2=0.99+ baseline, the realistic ceiling for improvement is small, and a much heavier model risks overfitting a genuinely subtle residual signal — consistent with "do not train a deep model just because it sounds advanced" | n/a | n/a | Not pursued — the simple ridge-regression result (marginal in-distribution win, cross-crop loss) is judged to have already answered the key scientific question (does a fitted model beat persistence here) without needing a heavier model to reach the same conclusion faster |

## Why soil-moisture forecasting (target #1) was selected as this phase's actual training target
It is the only target across all 9 audited real datasets that is BOTH
(a) leak-free-by-construction and independently verified as such via
unit tests, and (b) evaluable with a genuinely challenging, real
baseline (persistence, R^2=0.9923) rather than a weak strawman —
making a positive result meaningful and a negative result (as
partially obtained here) honest and informative, not just "easy."
Target #3's onset-prediction task, by contrast, was already attempted
on a different dataset with a negative result; re-running the exact
same task on Arnesano was considered but deprioritized in favor of
attempting the genuinely NEW target (soil-moisture forecasting) this
phase, since repeating an already-answered question would not have
advanced the cumulative research state as much.
