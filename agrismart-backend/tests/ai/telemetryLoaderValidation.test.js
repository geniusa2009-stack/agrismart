'use strict';

/**
 * tests/ai/telemetryLoaderValidation.test.js
 *
 * Regression coverage for the fix to a real gap found during the
 * Phase 0 native-AI-pipeline audit: ai/data/telemetryLoader.js
 * exported validateTelemetryDoc/validateIrrigationEvent but neither
 * was ever called anywhere — loadRealDataset() handed raw, unvalidated
 * Mongo docs straight to the dataset builder / feature engineering.
 *
 * This suite proves two things:
 *   1. (unit) The validation functions themselves reject malformed
 *      input, preserve valid input unchanged, and pass through the
 *      new AgriSmart-native contract fields without inventing/coercing
 *      any value.
 *   2. (integration) loadRealDataset() now actually calls them:
 *      a malformed real Mongo document cannot reach
 *      telemetryByDevice/irrigationByValve (and therefore cannot reach
 *      ai/features/featureEngineering.js), while a valid document
 *      (old-field-only or with the new contract fields) passes through
 *      unchanged, and dropped counts are honestly reported.
 */

const mongoose = require('mongoose');
const { loadRealDataset, validateTelemetryDoc, validateIrrigationEvent } = require('../../ai/data/telemetryLoader');
const { computeFeatures } = require('../../ai/features/featureEngineering');
const Farm = require('../../src/modules/farms/farm.model');
const User = require('../../src/modules/users/user.model');
const Valve = require('../../src/modules/irrigation/valve.model');
const Telemetry = require('../../src/modules/telemetry/telemetry.model');
const IrrigationEvent = require('../../src/modules/irrigation/irrigationEvent.model');

describe('ai/data/telemetryLoader validation (unit)', () => {
  describe('validateTelemetryDoc', () => {
    test('rejects a doc with no recordedAt', () => {
      expect(validateTelemetryDoc({ readings: { soilMoisturePercent: 40 } })).toBeNull();
    });

    test('rejects a doc with an unparseable recordedAt', () => {
      expect(validateTelemetryDoc({ recordedAt: 'not-a-date', readings: { soilMoisturePercent: 40 } })).toBeNull();
    });

    test('rejects a doc with no usable soilMoisturePercent (missing)', () => {
      expect(validateTelemetryDoc({ recordedAt: new Date(), readings: {} })).toBeNull();
    });

    test('rejects a doc with soilMoisturePercent out of the physical 0-100 range', () => {
      expect(validateTelemetryDoc({ recordedAt: new Date(), readings: { soilMoisturePercent: 140 } })).toBeNull();
      expect(validateTelemetryDoc({ recordedAt: new Date(), readings: { soilMoisturePercent: -5 } })).toBeNull();
    });

    test('rejects a doc where soilMoisturePercent is not a number', () => {
      expect(validateTelemetryDoc({ recordedAt: new Date(), readings: { soilMoisturePercent: 'wet' } })).toBeNull();
    });

    test('preserves a valid old-shape doc unchanged, nulling absent optional fields (never coercing/inventing)', () => {
      const recordedAt = new Date('2026-01-01T00:00:00.000Z');
      const result = validateTelemetryDoc({
        recordedAt,
        readings: { soilMoisturePercent: 42, temperatureCelsius: 21.5 },
      });
      expect(result).toEqual({
        recordedAt,
        farmId: null,
        zoneId: null,
        readings: {
          soilMoisturePercent: 42,
          temperatureCelsius: 21.5,
          soilSalinityPpt: null,
          soilEcMicrosiemensPerCm: null,
          airTemperatureCelsius: null,
          relativeHumidityPercent: null,
          precipitationMm: null,
          flowMeter: null,
        },
      });
    });

    test('passes through the new AgriSmart-native contract fields when present, without any unit conversion', () => {
      const recordedAt = new Date('2026-01-01T00:00:00.000Z');
      const farmId = new mongoose.Types.ObjectId();
      const zoneId = new mongoose.Types.ObjectId();
      const result = validateTelemetryDoc({
        recordedAt,
        farmId,
        zoneId,
        readings: {
          soilMoisturePercent: 42,
          soilEcMicrosiemensPerCm: 850,
          airTemperatureCelsius: 28.3,
          relativeHumidityPercent: 55,
          precipitationMm: 0,
          flowMeter: { cumulativeVolumeLiters: 1200.5, flowRateLitersPerMinute: 3.2 },
        },
      });
      expect(result.farmId).toBe(String(farmId));
      expect(result.zoneId).toBe(String(zoneId));
      expect(result.readings.soilEcMicrosiemensPerCm).toBe(850);
      // Explicitly NOT computing soilSalinityPpt from EC — no conversion exists.
      expect(result.readings.soilSalinityPpt).toBeNull();
      expect(result.readings.airTemperatureCelsius).toBe(28.3);
      expect(result.readings.relativeHumidityPercent).toBe(55);
      expect(result.readings.precipitationMm).toBe(0);
      expect(result.readings.flowMeter).toEqual({ cumulativeVolumeLiters: 1200.5, flowRateLitersPerMinute: 3.2 });
    });

    test('non-numeric new-contract fields are nulled, never coerced', () => {
      const result = validateTelemetryDoc({
        recordedAt: new Date(),
        readings: {
          soilMoisturePercent: 42,
          soilEcMicrosiemensPerCm: 'high',
          flowMeter: { cumulativeVolumeLiters: 'lots' },
        },
      });
      expect(result.readings.soilEcMicrosiemensPerCm).toBeNull();
      expect(result.readings.flowMeter).toBeNull();
    });
  });

  describe('validateIrrigationEvent', () => {
    test('rejects a doc with no startedAt', () => {
      expect(validateIrrigationEvent({ endedAt: new Date() })).toBeNull();
    });

    test('rejects a doc with an unparseable startedAt', () => {
      expect(validateIrrigationEvent({ startedAt: 'nope' })).toBeNull();
    });

    test('preserves a valid event unchanged and passes through appliedWaterVolumeLiters when present', () => {
      const startedAt = new Date('2026-01-01T00:00:00.000Z');
      const endedAt = new Date('2026-01-01T00:10:00.000Z');
      const result = validateIrrigationEvent({
        startedAt,
        endedAt,
        actualDurationSeconds: 600,
        plannedDurationSeconds: 600,
        appliedWaterVolumeLiters: 18.4,
      });
      expect(result).toEqual({
        startedAt,
        endedAt,
        actualDurationSeconds: 600,
        plannedDurationSeconds: 600,
        appliedWaterVolumeLiters: 18.4,
      });
    });

    test('nulls appliedWaterVolumeLiters when absent (never derives it from duration)', () => {
      const result = validateIrrigationEvent({ startedAt: new Date(), plannedDurationSeconds: 300 });
      expect(result.appliedWaterVolumeLiters).toBeNull();
    });

    test('nulls a negative appliedWaterVolumeLiters rather than accepting an impossible value', () => {
      const result = validateIrrigationEvent({ startedAt: new Date(), plannedDurationSeconds: 300, appliedWaterVolumeLiters: -5 });
      expect(result.appliedWaterVolumeLiters).toBeNull();
    });
  });
});

describe('ai/data/telemetryLoader loadRealDataset (integration, real Mongo)', () => {
  let farmId;
  let valve;

  beforeEach(async () => {
    const owner = await User.create({
      fullName: 'Test Farmer',
      email: `farmer-${Date.now()}@example.test`,
      passwordHash: 'x'.repeat(20),
    });
    const farm = await Farm.create({ name: 'Test Farm', ownerId: owner._id });
    farmId = farm._id;
    valve = await Valve.create({ deviceId: 'device-under-test', farmId });
  });

  test('a malformed telemetry doc inserted directly into Mongo never reaches telemetryByDevice or feature engineering', async () => {
    const goodRecordedAt = new Date('2026-02-01T00:00:00.000Z');
    await Telemetry.collection.insertMany([
      { recordedAt: goodRecordedAt, deviceId: 'device-under-test', farmId, readings: { soilMoisturePercent: 45 } },
      // Malformed: soilMoisturePercent out of range.
      { recordedAt: new Date('2026-02-01T01:00:00.000Z'), deviceId: 'device-under-test', farmId, readings: { soilMoisturePercent: 999 } },
      // Malformed: no usable moisture reading at all.
      { recordedAt: new Date('2026-02-01T02:00:00.000Z'), deviceId: 'device-under-test', farmId, readings: {} },
    ]);

    const result = await loadRealDataset();
    expect(result.ok).toBe(true);
    expect(result.counts.invalidTelemetryDropped).toBe(2);

    const telemetry = result.telemetryByDevice.get('device-under-test');
    expect(telemetry.length).toBe(1);
    expect(telemetry[0].recordedAt.getTime()).toBe(goodRecordedAt.getTime());

    // Prove the malformed points are unreachable from feature engineering too
    // (not merely dropped from the map's length, but genuinely absent upstream
    // of computeFeatures, which is the actual leakage-sensitive consumer).
    const { features } = computeFeatures(telemetry, [], goodRecordedAt);
    expect(features.soilMoisturePercent).toBe(45);
  });

  test('a valid irrigation event with the new appliedWaterVolumeLiters field passes through unchanged; a malformed one is dropped', async () => {
    const startedAt = new Date('2026-02-01T00:00:00.000Z');
    await IrrigationEvent.collection.insertMany([
      {
        valveId: valve._id,
        farmId,
        startedAt,
        endedAt: new Date('2026-02-01T00:05:00.000Z'),
        plannedDurationSeconds: 300,
        actualDurationSeconds: 300,
        appliedWaterVolumeLiters: 12.5,
        triggeredBy: 'manual',
      },
      // Malformed: no startedAt at all.
      { valveId: valve._id, farmId, plannedDurationSeconds: 300, triggeredBy: 'manual' },
    ]);

    const result = await loadRealDataset();
    expect(result.ok).toBe(true);
    expect(result.counts.invalidIrrigationEventsDropped).toBe(1);

    const events = result.irrigationByValve.get(String(valve._id));
    expect(events.length).toBe(1);
    expect(events[0].appliedWaterVolumeLiters).toBe(12.5);
  });

  test('valid telemetry with the new AgriSmart-native fields survives loadRealDataset unchanged', async () => {
    const recordedAt = new Date('2026-02-01T03:00:00.000Z');
    await Telemetry.collection.insertMany([
      {
        recordedAt,
        deviceId: 'device-under-test',
        farmId,
        readings: {
          soilMoisturePercent: 38,
          soilEcMicrosiemensPerCm: 900,
          airTemperatureCelsius: 30,
          relativeHumidityPercent: 40,
          flowMeter: { cumulativeVolumeLiters: 500, flowRateLitersPerMinute: 2 },
        },
      },
    ]);

    const result = await loadRealDataset();
    const telemetry = result.telemetryByDevice.get('device-under-test');
    expect(telemetry.length).toBe(1);
    expect(telemetry[0].readings.soilEcMicrosiemensPerCm).toBe(900);
    expect(telemetry[0].readings.flowMeter).toEqual({ cumulativeVolumeLiters: 500, flowRateLitersPerMinute: 2 });
    expect(telemetry[0].farmId).toBe(String(farmId));
  });
});
