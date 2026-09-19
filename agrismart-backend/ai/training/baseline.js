'use strict';

/**
 * ai/training/baseline.js
 *
 * Non-ML baselines the trained model must beat before it is allowed to
 * be reported as an improvement (spec section 6/7 — "if the model does
 * not beat the baseline, say so").
 */

/**
 * Persistence baseline: "whatever is true right now stays true" —
 * since examples already exclude points currently below threshold
 * (datasetBuilder.js), the persistence prediction for THIS problem is
 * always "no, moisture will not drop below threshold soon" (label 0).
 * A deliberately naive floor every real model must clear.
 */
function persistenceBaselinePredict() {
  return 0;
}

/**
 * Rule/trend baseline: linearly extrapolates the existing
 * moistureTrendPerHour feature (already computed the same way the
 * dashboard could) forward 3 hours and predicts irrigation-need if the
 * projection crosses the given threshold. This is the strongest
 * non-ML baseline available from data already in the system — the bar
 * the ML model actually needs to clear to justify its extra
 * complexity.
 */
function trendBaselinePredict(features, thresholdPercent, horizonHours = 3) {
  const { soilMoisturePercent, moistureTrendPerHour } = features;
  if (soilMoisturePercent === null || moistureTrendPerHour === null) return 0;
  const projected = soilMoisturePercent + moistureTrendPerHour * horizonHours;
  return projected < thresholdPercent ? 1 : 0;
}

module.exports = { persistenceBaselinePredict, trendBaselinePredict };
