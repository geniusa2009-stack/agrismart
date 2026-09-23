# AgriSmart Real Data Collection Plan

**Schema note (added after this plan was written):** the concrete field
names/units this plan discusses in general terms (irrigation-event log,
per-zone identifiers, provenance/quality flags) are now backed by a
FINALIZED, implemented backend schema — see
`ai/external/AGRISMART_DATA_COLLECTION_CONTRACT.md`'s "Implementation
status" section and `GAP_ANALYSIS.md`. That implementation does not
change this plan's core recommendation (a full season of continuous
AgriSmart-native telemetry is still the real bottleneck, not schema
fields) and did not retrain, retune, or promote any model.

Status date: 2026-09-11. Both external datasets modeled so far produced
negative results (see `AI_MODEL_CARD.md`). Neither failure was caused
by AgriSmart lacking the right SENSOR TYPES — the Python ablation in
`AI_ABLATION_REPORT.md` shows AgriSmart-compatible features
(soil moisture, salinity, temperature, plus an irrigation-event log)
can support a persistence-style prediction task nearly as well as a
fuller external feature set. The bottleneck is that neither model was
ever trained or validated on AgriSmart's OWN site, sensors, crop, or
irrigation-controller behavior — both are external-site transfer
attempts, which is a fundamentally weaker basis for a farm-specific
recommendation than training directly on that farm's own history.

## What AgriSmart should start recording, and why

1. **Irrigation-event log with precise onset/end timestamps**
   (AgriSmart likely already logs valve open/close via
   `irrigationRepository` — confirm retention length and granularity).
   Needed to eventually train `irrigation_event_next_1h` (or a
   redefinition of it) directly on AgriSmart's own irrigation-decision
   history, rather than transferring a model from an Italian research
   testbed.
2. **At least one full growing season per farm/zone, continuously**,
   not just a rolling recent window — the seasonal non-stationarity
   found in the external dataset (onset frequency ramps up mid-season,
   tapers late-season) means a short window cannot characterize a
   full season's behavior, and a leak-free chronological split needs
   enough season-length to hold out a meaningful, still-representative
   tail.
3. **Multiple seasons/years per farm where feasible** — this project's
   only genuine external-generalization test (2024→2025) was only
   possible because the source dataset had two independent seasons.
   Without a second AgriSmart season, any AgriSmart-trained model can
   only be evaluated with an in-season chronological holdout, which is
   weaker evidence of generalization.
4. **Explicit provenance/quality flags on ingested telemetry** —
   both real external datasets used this phase had genuine,
   fixable data-quality defects (off-season pollution, impossible
   sensor values). AgriSmart's own pipeline should record device
   health/plausibility flags at ingestion time so a future training
   pipeline can apply the same "reject, don't silently correct"
   discipline this project used.
5. **Per-zone/valve identifiers stable across seasons** (AgriSmart
   likely already has this via `valve._id`/`deviceId`) — required for
   any grouped/chronological split that avoids leaking one valve's
   history across train/test boundaries.

## What NOT to prioritize based on this phase's findings
- New sensor hardware for NPK, pH, solar radiation, or wind speed
  (Dataset #1's missing features) is not obviously worth the
  investment purely to rescue that one soil-moisture-regression
  target — that failure mode was specific to a dataset with no
  irrigation label at all, a fundamentally different situation from
  AgriSmart's own farms (which DO have real irrigation decisions to
  learn from, once enough history accumulates).

## Suggested minimum bar before attempting an AgriSmart-native retraining
At least one full season of continuous telemetry + irrigation-event
history for at least one real AgriSmart valve/zone, ideally two
seasons for a genuine external-season validation test analogous to the
2024→2025 check performed in this phase. Until that data exists, this
project recommends AGAINST attempting to force a production model from
transfer learning on either external dataset alone.

---

# Update after the Arnesano result (closest-to-validated model so far)

The Arnesano result changes this plan's emphasis in one important way:
it demonstrates that a simple model CAN edge out a strong persistence
baseline on in-distribution data — the bottleneck is not modeling
technique, it's that the learned edge is evidently site/crop-specific
and does not transfer even across CROPS AT THE SAME SITE, let alone
across sites. This sharpens recommendation #3 from the original plan:

- **Multiple seasons per farm/zone remains the top priority** (unchanged).
- **NEW: if AgriSmart ever operates multiple crop types on the same
  site**, this project's finding (a model trained on tomato/zucchini
  did not transfer to blueberry) suggests a PER-CROP or PER-ZONE
  model may be necessary rather than one model serving every zone on a
  farm — worth planning for in AgriSmart's own model-registry design
  (the `target` string could eventually be parametrized by crop type,
  not just by task).
- **NEW: a genuinely strong baseline (persistence) should always be
  computed before judging any future AgriSmart-native model** — this
  phase's own experience shows a model can look validated against a
  weak baseline (mean) while failing against a strong, realistic one
  (persistence), and AgriSmart's own soil moisture is very likely
  similarly autocorrelated, so this same gate should be applied to any
  future native-data model as a matter of course, not just for
  external-dataset research.
- **De-prioritized further (reconfirmed):** new sensor hardware
  purchases. Three real external datasets have now been fully modeled
  and NONE of their failures trace to a sensor AgriSmart lacks — the
  Arnesano model's shortfall is a generalization problem (crop
  transfer), not a feature-availability problem.
