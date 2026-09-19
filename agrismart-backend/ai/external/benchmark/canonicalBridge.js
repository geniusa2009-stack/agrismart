'use strict';

/**
 * ai/external/benchmark/canonicalBridge.js
 *
 * Converts canonical research-schema records (ai/external/schemas)
 * into the shape ai/features/featureEngineering.js and
 * ai/data/datasetBuilder.js already expect (telemetryHistory /
 * irrigationHistory) — so the SAME feature engineering and leakage
 * discipline built for AgriSmart's own data is reused for external
 * benchmarks rather than re-implemented (and possibly re-broken).
 *
 * Irrigation events are derived from irrigationState transitions
 * ('closed' -> 'open' opens an event, 'open' -> 'closed' closes it).
 * A dataset with no irrigationState column simply yields zero
 * irrigation events — genuinely missing, not fabricated.
 */

function groupByEntity(records) {
  const byEntity = new Map();
  for (const r of records) {
    const key = r.fieldId || r.zoneId || r.farmId || 'unknown-entity';
    if (!byEntity.has(key)) byEntity.set(key, []);
    byEntity.get(key).push(r);
  }
  for (const [, list] of byEntity) {
    list.sort((a, b) => a.timestamp - b.timestamp);
  }
  return byEntity;
}

function toTelemetryHistory(entityRecords) {
  return entityRecords
    .filter((r) => r.soilMoisture !== null && r.soilMoisture !== undefined)
    .map((r) => ({
      recordedAt: r.timestamp,
      readings: {
        soilMoisturePercent: r.soilMoisture,
        temperatureCelsius: r.soilTemperature ?? r.airTemperature ?? null,
        soilSalinityPpt: r.soilSalinity,
      },
    }));
}

function toIrrigationHistory(entityRecords) {
  const events = [];
  let openStart = null;
  for (const r of entityRecords) {
    if (r.irrigationState === 'open' && openStart === null) {
      openStart = r.timestamp;
    } else if (r.irrigationState === 'closed' && openStart !== null) {
      events.push({
        startedAt: openStart,
        endedAt: r.timestamp,
        actualDurationSeconds: Math.round((r.timestamp.getTime() - openStart.getTime()) / 1000),
        plannedDurationSeconds: Math.round((r.timestamp.getTime() - openStart.getTime()) / 1000),
      });
      openStart = null;
    }
  }
  return events;
}

/**
 * @param {Array} canonicalRecords
 * @returns {Array<{ entityId: string, telemetryHistory: Array, irrigationHistory: Array }>}
 */
function bridgeToAgriSmartShape(canonicalRecords) {
  const grouped = groupByEntity(canonicalRecords);
  const out = [];
  for (const [entityId, entityRecords] of grouped) {
    out.push({
      entityId,
      telemetryHistory: toTelemetryHistory(entityRecords),
      irrigationHistory: toIrrigationHistory(entityRecords),
    });
  }
  return out;
}

module.exports = { bridgeToAgriSmartShape, groupByEntity, toTelemetryHistory, toIrrigationHistory };
