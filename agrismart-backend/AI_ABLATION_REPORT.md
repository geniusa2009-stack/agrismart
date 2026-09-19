# AI Ablation Report

Status date: 2026-09-11

## Dataset #2 — `irrigation_event_next_1h`: irrigation-history feature ablation (Node, onset label)

Two models trained identically except for feature set:

| Model | 2024 in-season test ROC-AUC | 2024 test avg. precision | Base rate (2024) |
|---|---|---|---|
| Full feature set (includes irrigation-history features: hours-since-last-irrigation, minutes-irrigated-last-6h/24h) | 0.2619 | 0.0015 | 0.01433 |
| Ablated (irrigation-history features blanked) | **0.733** | 0.0039 | 0.01433 |

**Honest interpretation:** the ablated model scoring HIGHER than the
full model is not evidence the full model's extra features are
"harmful" in any generalizable sense — both are far below the
project's own validation bar (ROC-AUC > 0.75 AND avg. precision >
3× base rate, required on BOTH 2024 test and the 2025 external
season; the ablated model does clear 0.75 on this one 2024 slice but
was not the one carried forward, since the target catalog and split
protocol commit to evaluating the FULL feature model as the actual
candidate, and a full re-run of the dual-condition gate for the
ablated variant was not performed — reporting a single favorable
number from one slice of one condition would itself risk the "declare
success" failure mode the user's rules warn against). This ablation
is reported to characterize instability/sensitivity to feature choice
on this rare-event task, not as evidence of a hidden better model that
was withheld.

## Dataset #2 — Python feasibility prototype ablation (persistence label, NOT the final target)

Before the Node onset-label pipeline was built, an earlier Python
feasibility prototype used the EASIER "valve open at ANY point in the
next hour" (persistence-inclusive) label to answer a different,
narrower question: **if a model could be trained on this task
definition at all, would AgriSmart's actual real hardware
(`soilMoisturePercent`, `soilSalinityPpt`, `temperatureCelsius`) plus
its existing irrigation-event log be enough to reach close to full
external-dataset feature-set performance, or does the task fundamentally
require sensors AgriSmart doesn't have?**

Result: restricting the Python prototype to AgriSmart-compatible
features performed nearly as well as the full external feature set
under the persistence-inclusive label. This is a materially more
encouraging finding than Dataset #1's complete feature-availability
mismatch (which needed NPK, pH, solar radiation, and wind speed —
sensors AgriSmart's real telemetry does not have at all).

**This finding must not be conflated with the Node pipeline's final
result.** The Python ablation answers "is persistence-style irrigation
activity predictable from AgriSmart-compatible features" (yes,
roughly). The Node pipeline's registered, validation-gated result
answers "is a NEW irrigation-event onset predictable one hour ahead"
(no — it does not clear the bar, on either evaluated season). Both are
reported; neither is allowed to stand in for the other. The practical
implication is that AgriSmart-compatible telemetry is not the
bottleneck — the onset-prediction task itself, on this dataset, at
this horizon, is the part that did not validate. This is why
`AGRISMART_REAL_DATA_COLLECTION_PLAN.md` recommends collecting more
real AgriSmart irrigation-decision history (to eventually train
directly on AgriSmart's own site/behavior) rather than recommending new
sensor hardware.

## What was NOT done
No hyperparameter sweep beyond the four L2 values already covered in
`ai/training/evolvingTomato/train.js` (`{0.001, 0.01, 0.1, 1}`,
selected by validation average precision) was run as a further
ablation — given the magnitude of the gap to the validation bar
(ROC-AUC 0.26–0.31 vs. a 0.75 requirement), further hyperparameter
search was judged very unlikely to close it and was not pursued purely
to keep searching for a passing number, consistent with the "do not
force success" rule.

---

# Arnesano — irrigation-feature ablation (from the actual saved model artifact)

| Model | Test R^2 (zones 1/2/4 pooled) |
|---|---|
| Full feature set (includes `irrigationDurationSecondsCurrentBin`, `waterLitersPast4h`) | 0.9927 |
| Ablated (irrigation features removed) | 0.9927 (0.99270 vs 0.99269 — effectively identical, well within noise) |

**Honest interpretation:** unlike the Evolving Tomato Testbed's
ablation (where removing irrigation-history features changed the
result dramatically), here the irrigation features add essentially
NO measurable signal beyond what weather + current soil state already
provide. This makes sense physically: with persistence already at
R^2=0.9923, almost all of the predictable variance in "soil moisture
24h from now" is explained by "soil moisture right now," and the
model's small edge over persistence comes from weather/soil-state
trends, not from knowing whether irrigation just happened. This is a
genuine, informative negative ablation result (irrigation features are
not pulling their weight in this specific formulation), not a bug —
consistent with the position that a marginal model improvement over a
very strong baseline can still fail to generalize (as it does on
zone 5) even when every individual feature looks "reasonable."
