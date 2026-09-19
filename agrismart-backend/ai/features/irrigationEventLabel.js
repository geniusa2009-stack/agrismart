'use strict';

/**
 * ai/features/irrigationEventLabel.js
 *
 * A SECOND, independent label definition for irrigation-related
 * prediction, alongside ai/features/featureEngineering.js's
 * computeLabel (which defines "soil moisture crosses below a
 * threshold" — a rule derived from soil moisture alone, used for
 * workstream 1's synthetic-dev-era model when no real irrigation
 * ground truth existed).
 *
 * This function instead uses REAL, OBSERVED irrigation decisions
 * (actual valve open/close events, as recorded by a real irrigation
 * controller) as the label — "did irrigation actually happen in the
 * next `horizonMs`", not "did an assumed threshold get crossed". This
 * only became possible once a real dataset with genuine valve/irrigation
 * ground truth was available (the "Evolving Tomato Cultivation
 * Testbed" dataset — see ai/external/adapters/evolvingTomatoCsvAdapter.js).
 *
 * It deliberately reuses ai/features/featureEngineering.js's
 * computeFeatures() UNCHANGED for the feature side (that function's
 * leak-free design is independent of how the label is defined) and is
 * registered under a DIFFERENT model-registry target
 * ('irrigation_event_next_1h') so it is never confused with or
 * silently blended into workstream 1's 'irrigation_need_next_3h'
 * moisture-threshold model.
 */

/**
 * @param {Array<{startedAt: Date, endedAt: Date|null}>} irrigationHistory - ascending by startedAt
 * @param {Date} asOf
 * @param {number} horizonMs
 * @param {number} observedThroughMs - the latest timestamp (epoch ms) up to which
 *   THIS entity's data streams (both the sensor stream and the valve stream) are
 *   actually known to have been recorded. Required so that "no irrigation event
 *   found in the window" can be told apart from "we simply stopped observing
 *   before the window ended" — the same honesty principle as
 *   featureEngineering.computeLabel returning null on insufficient future data,
 *   applied here across TWO independent real device streams instead of one.
 * @returns {boolean|null} true/false, or null if the window was not fully observed
 */
function computeIrrigationEventLabel(irrigationHistory, asOf, horizonMs, observedThroughMs) {
  const windowEnd = asOf.getTime() + horizonMs;
  if (observedThroughMs < windowEnd) return null; // window not fully observed — unknown, not fabricated as "no event"

  return irrigationHistory.some((ev) => {
    const start = ev.startedAt.getTime();
    return start > asOf.getTime() && start <= windowEnd;
  });
}

module.exports = { computeIrrigationEventLabel };
