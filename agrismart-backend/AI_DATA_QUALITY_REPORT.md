# AI Data Quality Report — Evolving Tomato Testbed (Dataset #2)

Status date: 2026-09-11
(Dataset #1's quality findings remain in the original `AI_TRAINING_REPORT.md` and are unchanged/not restated here.)

## Defect 1 — Off-season soil-data pollution

**Finding:** soil sensors on some lines (1, 2, 5) ran continuously
across season boundaries — a file named `soil2024.csv` contains
readings dating back into June 2023, while the corresponding
`valve_controller2024.csv` (the actual irrigation ground truth) only
covers the real 2024 monitored season (~June–Sept 2024).

**Why it matters:** a soil reading from outside the valve stream's
observed window has no real irrigation-outcome signal available at
all — not "irrigation didn't happen" (a valid negative label) but "we
have no idea, because the valve wasn't being monitored yet." Including
these rows would silently manufacture a large block of contextually
meaningless negative examples, corrupting both the label distribution
and the learned feature-label relationship.

**How it was caught:** empirically, not by inspection alone — an
early un-fixed run printed a nonsensical training-period start date
("2023-06-06T14:57:15.025Z" for what was meant to be "the 2024
season") and produced an internally inconsistent result (the ablation
model, with irrigation-history features removed, scored BETTER
(ROC-AUC 0.8252) than the full model (ROC-AUC 0.0847) — a strong
signal that the feature/label relationship was being computed over
garbage context).

**Fix:** the valve stream's own observed `[min, max]` timestamp window
is auto-detected per season file, and soil rows are restricted to
that window before canonical-record construction. Excluded rows are
counted, not silently dropped: `outsideValveWindowCount` (2024:
53,187 rows) is reported in every adapter result and in
`AI_DATASET_INVENTORY.md`.

## Defect 2 — Physically impossible sensor values

**Finding:** `soil2024.csv`'s `humidity` (soil-moisture, %RH) column
has 3 rows with value `655.35` — impossible for a 0–100% RH reading.

**How it was caught:** direct inspection (`pandas` `.describe()` and
an explicit `(soil['humidity'] > 100).sum()` check) during forensic
exploration, not assumed.

**Fix:** a `SOIL_MOISTURE_PLAUSIBLE_RANGE = [0, 100]` check REJECTS
(does not clamp, average, or otherwise "correct") any such row.
Rejected rows are counted (`implausibleSoilMoistureCount`) and
included in the adapter's `rejected` array with an explicit
`implausible_value` issue code, never silently dropped without
accounting.

## Non-bug investigation — the large Python-prototype-vs-Node-pipeline metric gap

Before either bug fix above, and again after both fixes, the Node
pipeline's real metrics remained poor (2024 in-season test ROC-AUC
0.2619, external 2025 ROC-AUC 0.3133 — both worse than random; the
ablation model without irrigation-history features again scored
notably better, ROC-AUC 0.733, than the full model). This was
investigated as a potential third bug, via:

1. Printing the first 10 derived `irrigationHistory` events for a
   representative zone (line 2) — structurally correct: plausible
   start/end timestamps and durations, no obvious parsing error.
2. Printing a week-by-week breakdown of the label's positive rate
   across the full 2024 season — this revealed genuine, physically
   meaningful **seasonal non-stationarity**: irrigation-onset events
   are near-zero in June, ramp up through mid-July/August, and taper
   to near-zero by September. A naive chronological 70/15/15 split's
   test tail therefore lands almost entirely in this low-activity
   late-season period, which is a real property of the season, not an
   artifact.
3. Re-running with horizon = 1h / 3h / 6h (all onset-based) — all
   produced similarly poor results, ruling out "horizon too narrow" as
   the sole explanation.

**Conclusion (not a bug):** the earlier Python feasibility prototype's
label ("valve open at ANY point in the next 60 minutes" — which
heavily counts already-ongoing irrigation, i.e. **persistence**) is a
fundamentally different and easier task than the Node implementation's
label ("will a NEW irrigation event START in the next hour" — **onset
prediction**, harder, rarer: only 269 positive examples in the entire
2024 season at the stride-6 sampling rate). This is reported as a
genuine target-definition/task-difficulty difference, confirmed by
direct comparative analysis, not silently reconciled by changing one
implementation to match the other's flattering numbers. See
`AI_ABLATION_REPORT.md` for the corresponding Python-ablation result,
which answers the persistence-inclusive question and must not be
conflated with the Node pipeline's stricter onset-only result.

## Defect log discipline
Both defects above were found, fixed, and their counts are still
visible in the adapter's returned result object (`outsideValveWindowCount`,
`implausibleSoilMoistureCount`) — nothing was fixed "silently." The
non-bug investigation is retained in this document specifically so a
future maintainer does not re-discover the same gap and mistake it for
a new regression.

---

# Batch 1 (new phase) — Arnesano Multi-Sector Precision-Irrigation Dataset

Status date: 2026-09-11. Audit-only — no adapter/training code written
yet, per this phase's explicit instruction. All findings below were
produced by directly loading and computing over the actual attached
CSV files (pandas), not by reading documentation alone; every
documented claim that was checked came back matching the actual data.

## Overall documentation quality: high, and empirically confirmed
Every row count, split-file subset relationship, `is_raw` ratio,
event/sector/stop_reason breakdown, timestamp regularity, and the
`target_point_24h = soil_moisture.shift(-144)` construction claimed by
this dataset's own README/DATA_DICTIONARY was independently
recomputed and matched exactly. This is the most internally consistent
and well-documented dataset encountered in this project so far. Two
real gaps were found regardless (below) — thoroughness does not mean
uncritical acceptance.

## Finding 1 — the "24-hour" target is frequently NOT actually 24 hours ahead (confirms, and quantifies, the dataset's own caveat)

The README explicitly warns "144 steps span 24 hours only where the
series is continuous." This was verified and quantified directly by
comparing each row's own timestamp to its target row's timestamp
(`ts.shift(-144) - ts`) in every preprocessed file:

| Zone | Fraction of rows where target is EXACTLY 24h ahead | Median realized horizon | Max realized horizon |
|---|---|---|---|
| 1 | 48.3% | 1d 00:40 | 21d 20:10 |
| 2 | 60.1% | 1d 00:00 | 25d 01:00 |
| 3 | **0.0%** | **13d 23:40** | 28d 06:00 |
| 4 | 30.1% | 1d 00:20 | 17d 08:20 |
| 5 | 19.1% | 1d 04:20 | 26d 15:50 |

**This is a material finding for anyone using `target_point_24h`/
`target_mean_24h` as published:** in 4 of 5 zones, MOST rows' "24-hour"
target is actually looking further ahead than 24 hours (because rows
with missing soil moisture were dropped, not imputed, widening the
row-to-row time gap). Zone 3 is the extreme case: its "24-hour" target
is, on average, looking ~2 weeks ahead, not 1 day. Any future modeling
work with this dataset must either (a) rebuild the target directly
from the merged (gapped-but-regular) layer using a true wall-clock
24-hour lookup, discarding rows where no reading exists at exactly
+24h, or (b) treat the published target explicitly as "next available
reading, usually but not reliably ~24h out" and say so. Silently using
the published column as if it were a clean 24h-ahead target would be a
temporal-leakage-adjacent methodological error (not leakage in the
label-vs-feature sense, but a horizon-mislabeling error) — flagged here
before any training is attempted, exactly per this phase's request.

## Finding 2 — the documented physical-consistency check is weak and inconsistently signed across zones

The dataset's own methodology computes a Spearman correlation between
`water_vol_to_24h` (water applied over the horizon) and
`real_moisture_delta` (realized moisture change over the same horizon)
as a sanity check — physically, more water applied should correlate
with a larger moisture increase. Recomputed directly:

| Zone | Spearman rho | p-value | n |
|---|---|---|---|
| 1 | -0.011 | 0.267 (not significant) | 9,387 |
| 2 | -0.057 | 7e-10 (significant, WRONG sign) | 11,785 |
| 3 | -0.222 | 2e-12 (significant, WRONG sign) | 974 |
| 4 | +0.132 | 5e-50 (significant, correct sign) | 12,532 |
| 5 | +0.079 | 2e-17 (significant, correct sign, weak) | 11,670 |

Only zones 4 and 5 show the physically-expected positive relationship,
and even those are weak. Zones 1-3 show essentially no relationship or
a significant NEGATIVE one. This does not necessarily mean the water-
volume/moisture-delta values themselves are wrong (drainage, evapo-
transpiration, and the horizon-mislabeling issue in Finding 1 above
all plausibly dilute or confound this correlation over a "24h" window
that is often actually much longer), but it means this dataset's
water-applied-vs-moisture-response signal is noisier than the
headline "measured, actionable variable" framing in the README's own
"Value of the data" section might suggest, and should be treated
cautiously rather than assumed strong when this dataset is eventually
modeled.

## Finding 3 — sensor quality varies sharply by zone; zone 3 is the worst by every measure checked

| Zone | Longest soil-moisture flatline (10-min steps / hours) | EC readings outside [0,1000] uS/cm | pH readings outside [3,9] | Soil-moisture readings outside [0,115]% |
|---|---|---|---|---|
| 1 | 2,579 / ~430h (~18 days) | 0 | 14 | 2,584 |
| 2 | 243 / ~40h | 0 | 0 | 3 |
| 3 | **8,536 / ~1,423h (~59 days)** | **782** | **258** | 48 |
| 4 | 379 / ~63h | 0 | 0 | 5 |
| 5 | 143 / ~24h | 147 | 27 | 243 |

Zone 3 (potted tomato) is confirmed as the dataset's own README warns
("its probe stopped returning valid readings in late June... treat
sector 3 with care") — independently reproduced here with exact
numbers, not just accepted on the README's word: a ~59-day flatline
(the probe was effectively dead for roughly a third of the whole
monitoring period) plus the highest sensor-error-code rate for both EC
and pH of any sector. Zone 1 also has a substantial, previously-
unremarked ~18-day flatline and the second-highest out-of-range
soil-moisture count (2,584 — most of which are the `-32768`-style
error-code artifacts described in Finding 4, not zone 3 as one might
guess).

## Finding 4 — pH/EC sensor error codes are signed-16-bit-integer overflow sentinels, not random noise
The extreme pH/EC values documented as "sensor error codes" resolve to
specific repeating values: -32768, -32256, 31488, 32512, 32256 — these
are exactly the overflow/underflow sentinels of a signed 16-bit
integer (`-32768`/`32767` and near neighbors), consistent with a
firmware- or transmission-level integer overflow rather than a random
analog fault. This is recorded because it changes the correct handling
strategy: these should be REJECTED as a specific known sentinel
pattern (a data-quality rule that generalizes across zones and could
be applied to the raw layer too), not treated as generic outliers to
be clipped or winsorized.

## Finding 5 — package/documentation completeness gap
`file_manifest.csv`, `LICENSE.txt`, and `CITATION.cff` are listed in
the README's own package-contents section but are not present in the
attached zip. Recorded honestly rather than assumed present (per the
project's citation/provenance honesty rules) — if this dataset is
formally cited later, its DOI/license should be re-confirmed directly
from the eventual Mendeley record rather than from this zip's
(currently incomplete) self-description.

## What was verified and found to be entirely consistent (no further action needed)
Row counts (all 15+ files), the `MEASUREMENT_*` split-file subset
relationship, `is_raw` ratios in both raw actuator and raw measurement
streams, the `value`/`open` valve-state redundancy (0 mismatches across
3,055,944 rows), zero duplicate timestamps in every merged/preprocessed
file, zero duplicate `(time, node, channel)` triples in
`raw_actuators.csv`, and the exact construction of `target_point_24h`
as `soil_moisture.shift(-144)` within each file (100% match on every
row where both sides exist, across all 5 zones).

---

# Final batch — quality findings for the 3 remaining datasets

## AgriDataValue / Open-Meteo bundle
No irrigation-relevant quality issues to report (no irrigation
signal exists in this bundle at all — see AI_DATASET_INVENTORY.md
#12). Weather data itself is clean: zero nulls in 4 of 5 files, a
small (98/6,378, ~1.5%) null rate in the 2025 BIORO station file for
`airtemperature`/`airhumidity`/`dewpoint`/`earthtemperature1`.

## STUARD
**New finding this phase:** the header-duplication defect previously
found only in `stuard_soil_data.csv` also affects
`stuard_water_meter_data.csv` (same root cause: 3 per-line CSV exports
naively concatenated without stripping repeated header rows). Any
future consumer of either file must strip duplicate header lines
before parsing (a `pd.read_csv` call without this step throws
`OutOfBoundsDatetime`/`OverflowError` when it tries to parse the
literal string `"ts_generation"` as an epoch-ms value — reproduced
again this phase). A **new, minor** finding: the water meter's
cumulative `current_volume` reading has 3 backward (decreasing)
transitions in line 3 out of 10,941 readings — consistent with an
occasional meter reset/glitch, not investigated further since this
dataset is not being adapted for training (REJECTED role, unchanged).

## 9-Year Industrial Tomato dataset
No missing values in `Weather` (949/949) or `Irrigation` (524/524).
Minor missingness in `Crop` (6/100 `Y_ROT`, 6/100 `pH`, 18/100
`T_ACID`) and severe missingness in `physiology`'s `SCON` (176/188 null
— stomatal conductance was evidently measured on only a handful of
occasions). No duplicate rows found in any sheet. The 2007-2011
calendar gap in `Experiment` is a real feature of when field trials
were run, not a data-quality defect, and is documented as such rather
than silently smoothed over in any later analysis of this dataset.

## Cross-dataset leakage check (mandatory this phase)
Verified there is NO row-level overlap between any two datasets used
in this phase's training (Arnesano zones 1/2/4 vs. zone 5: different
physical sensors/site-zones, confirmed by distinct `zoneId`/device
identifiers and non-overlapping merged CSVs; Arnesano vs. Evolving
Tomato Testbed: different countries/sites/dates entirely, confirmed by
provenance metadata). The ONE confirmed near-duplicate relationship in
this entire project remains STUARD vs. Evolving Tomato Testbed's 2023
season (both REJECTED from any current training role, precisely
because of this), and it was excluded from all training, exactly as in
the prior phase — this phase re-confirms rather than reverses that
decision.
