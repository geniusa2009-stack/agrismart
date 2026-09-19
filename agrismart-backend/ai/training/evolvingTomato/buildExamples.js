'use strict';

/**
 * ai/training/evolvingTomato/buildExamples.js
 *
 * Builds labeled examples for the 'irrigation_event_next_1h' target
 * from ONE zone/line's real telemetry + irrigation history. Reuses
 * ai/features/featureEngineering.js's computeFeatures() UNCHANGED (the
 * same leak-free feature computation as workstream 1's model) and
 * ai/features/irrigationEventLabel.js's computeIrrigationEventLabel()
 * for the real, observed-ground-truth label.
 *
 * Sampling stride: unlike ai/data/datasetBuilder.js (which builds one
 * candidate example per telemetry reading — appropriate for that
 * model's much smaller MVP-scale telemetry volumes), this REAL
 * dataset has 10-minute native sampling over months, tens of
 * thousands of readings per zone. computeFeatures()/the label function
 * each re-scan a zone's full history per call, so building one example
 * per 10-minute reading is computationally impractical (O(n^2) over a
 * multi-month, 10-minute-cadence real series) and would also produce
 * enormous numbers of near-duplicate, highly-autocorrelated adjacent
 * examples. Examples are instead built at a fixed stride
 * (default: every 6th reading, i.e. ~hourly) — documented explicitly
 * here, and reported in AI_TRAINING_REPORT.md, rather than silently
 * changed later.
 */

const { computeFeatures } = require('../../features/featureEngineering');
const { computeIrrigationEventLabel } = require('../../features/irrigationEventLabel');

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_HORIZON_MS = HOUR_MS; // 'irrigation_event_next_1h'
const DEFAULT_STRIDE = 6; // every 6th telemetry reading (~hourly, at this dataset's 10-minute native cadence)

function buildExamplesForZone({ entityId, telemetryHistory, irrigationHistory, horizonMs = DEFAULT_HORIZON_MS, stride = DEFAULT_STRIDE }) {
  const examples = [];
  let skippedNoFutureLabel = 0;

  const lastTelemetryAt = telemetryHistory.length ? telemetryHistory[telemetryHistory.length - 1].recordedAt.getTime() : -Infinity;

  for (let i = 0; i < telemetryHistory.length; i += stride) {
    const point = telemetryHistory[i];
    const asOf = point.recordedAt;
    const { featureVersion, features } = computeFeatures(telemetryHistory, irrigationHistory, asOf);
    if (features.soilMoisturePercent === null) continue;

    const label = computeIrrigationEventLabel(irrigationHistory, asOf, horizonMs, lastTelemetryAt);
    if (label === null) {
      skippedNoFutureLabel += 1;
      continue;
    }

    examples.push({ entityId, asOf, featureVersion, features, label: label ? 1 : 0 });
  }

  return { examples, skippedNoFutureLabel };
}

/** Builds examples across every {entityId, telemetryHistory, irrigationHistory} entry (from canonicalBridge.bridgeToAgriSmartShape). */
function buildDatasetFromBridged(bridged, opts = {}) {
  let examples = [];
  const perEntity = [];
  for (const entity of bridged) {
    const { examples: entityExamples, skippedNoFutureLabel } = buildExamplesForZone({ ...entity, ...opts });
    examples = examples.concat(entityExamples);
    perEntity.push({
      entityId: entity.entityId,
      rawTelemetryPoints: entity.telemetryHistory.length,
      irrigationEvents: entity.irrigationHistory.length,
      labeledExamples: entityExamples.length,
      skippedNoFutureLabel,
    });
  }
  examples.sort((a, b) => a.asOf - b.asOf);
  const positives = examples.filter((e) => e.label === 1).length;
  return {
    examples,
    readiness: {
      totalLabeledExamples: examples.length,
      positiveExamples: positives,
      negativeExamples: examples.length - positives,
      classBalance: examples.length ? Math.round((positives / examples.length) * 10000) / 10000 : null,
      perEntity,
    },
  };
}

module.exports = { buildExamplesForZone, buildDatasetFromBridged, DEFAULT_HORIZON_MS, DEFAULT_STRIDE };
