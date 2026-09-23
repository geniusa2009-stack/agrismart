'use strict';

/**
 * tests/iot/dataCollectionContract.test.js
 *
 * Covers the AgriSmart-native data collection contract (see
 * ai/external/AGRISMART_DATA_COLLECTION_CONTRACT.md and
 * GAP_ANALYSIS.md): schema integrity for the new telemetry/irrigation-
 * event fields, timestamp consistency, unit-naming consistency, event
 * linkage (zone assignment, applied-water-volume <-> close command),
 * and missing-critical-field handling. Does not train, retrain,
 * validate, or promote any AI model — see tests/ai/safetyBoundary.test.js
 * for the (unmodified, still-passing) AI advisory-only guarantee.
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const createApp = require('../../src/app');
const IrrigationEvent = require('../../src/modules/irrigation/irrigationEvent.model');
const Telemetry = require('../../src/modules/telemetry/telemetry.model');

const app = createApp();

async function registerTechnician() {
  const email = `tech-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'CorrectHorseBattery1',
    fullName: 'Technician',
    role: 'technician',
  });
  return res.body.data.accessToken;
}

async function createFarm(accessToken, name) {
  const res = await request(app)
    .post('/api/v1/farms')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name });
  return res.body.data._id;
}

async function provisionDevice(accessToken, farmId, name) {
  const res = await request(app)
    .post('/api/v1/devices')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ farmId, name });
  return res.body.data; // { deviceId, farmId, status, deviceSecret }
}

async function createValve(accessToken, farmId, deviceId, name) {
  const res = await request(app)
    .post(`/api/v1/irrigation/farms/${farmId}/valves`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ deviceId, name });
  return res.body.data; // valve doc
}

async function createZone(accessToken, farmId, body) {
  return request(app)
    .post(`/api/v1/farms/${farmId}/zones`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body);
}

async function fullSetup() {
  const accessToken = await registerTechnician();
  const farmId = await createFarm(accessToken, 'Contract Test Farm');
  const device = await provisionDevice(accessToken, farmId, 'Soil + Flow Sensor');
  const valve = await createValve(accessToken, farmId, device.deviceId, 'Main Valve');
  return { accessToken, farmId, device, valve };
}

// ---------------------------------------------------------------------
// 1. Schema integrity
// ---------------------------------------------------------------------
describe('Data collection contract — telemetry schema integrity', () => {
  test('every new reading field (soil EC, weather context, flow meter) is accepted together', async () => {
    const { device } = await fullSetup();
    const res = await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', device.deviceId)
      .set('X-Device-Key', device.deviceSecret)
      .send({
        messageId: 'contract-1',
        readings: {
          soilMoisturePercent: 42,
          temperatureCelsius: 21.5,
          soilSalinityPpt: 1.1,
          soilEcMicrosiemensPerCm: 850,
          airTemperatureCelsius: 28.3,
          relativeHumidityPercent: 55,
          precipitationMm: 0,
          flowMeter: { cumulativeVolumeLiters: 1200.5, flowRateLitersPerMinute: 0 },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.stored).toBe(true);

    const stored = await Telemetry.findOne({ deviceId: device.deviceId, messageId: 'contract-1' });
    expect(stored).not.toBeNull();
    expect(stored.readings.soilEcMicrosiemensPerCm).toBe(850);
    expect(stored.readings.flowMeter.cumulativeVolumeLiters).toBe(1200.5);
    // farmId is present and server-derived — never accepted from the client (see next test).
    expect(String(stored.farmId)).toBe(String(device.farmId));
  });

  test('an out-of-range value for a new field (e.g. relativeHumidityPercent > 100) is rejected, never stored', async () => {
    const { device } = await fullSetup();
    const res = await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', device.deviceId)
      .set('X-Device-Key', device.deviceSecret)
      .send({ messageId: 'bad-humidity', readings: { relativeHumidityPercent: 250 } });

    expect(res.status).toBe(400);
    const stored = await Telemetry.findOne({ deviceId: device.deviceId, messageId: 'bad-humidity' });
    expect(stored).toBeNull();
  });

  test('a client cannot claim its own farmId/zoneId in the ingest payload — those are always server-derived', async () => {
    const { device } = await fullSetup();
    const res = await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', device.deviceId)
      .set('X-Device-Key', device.deviceSecret)
      .send({
        messageId: 'spoof-attempt',
        farmId: '000000000000000000000000',
        readings: { soilMoisturePercent: 10 },
      });

    // Rejected outright by the strict top-level schema (farmId is not a declared key).
    expect(res.status).toBe(400);
  });

  test('an empty flowMeter object is rejected (at least one flowMeter reading required when present)', async () => {
    const { device } = await fullSetup();
    const res = await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', device.deviceId)
      .set('X-Device-Key', device.deviceSecret)
      .send({ messageId: 'empty-flowmeter', readings: { flowMeter: {} } });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------
// 2. Timestamp consistency
// ---------------------------------------------------------------------
describe('Data collection contract — timestamp consistency', () => {
  test('recordedAt is always server-set, never accepted from the device payload', async () => {
    const { device } = await fullSetup();
    const claimedPast = new Date('2000-01-01T00:00:00Z').toISOString();
    const before = Date.now();

    const res = await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', device.deviceId)
      .set('X-Device-Key', device.deviceSecret)
      // recordedAt is not a declared field at all — only deviceReportedAt is.
      .send({ messageId: 'ts-1', recordedAt: claimedPast, readings: { soilMoisturePercent: 33 } });

    // The whole request is rejected outright (strict schema, unknown key) —
    // proving a device cannot smuggle a fake recordedAt through at all.
    expect(res.status).toBe(400);

    const stored = await Telemetry.findOne({ deviceId: device.deviceId, messageId: 'ts-1' });
    expect(stored).toBeNull();

    // A well-formed request (using the real field, deviceReportedAt) still
    // gets a server-authoritative recordedAt around "now", not the device's claim.
    const goodRes = await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', device.deviceId)
      .set('X-Device-Key', device.deviceSecret)
      .send({ messageId: 'ts-2', deviceReportedAt: claimedPast, readings: { soilMoisturePercent: 33 } });
    expect(goodRes.status).toBe(200);

    const goodStored = await Telemetry.findOne({ deviceId: device.deviceId, messageId: 'ts-2' });
    expect(goodStored.deviceReportedAt.toISOString()).toBe(claimedPast);
    expect(goodStored.recordedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(goodStored.recordedAt.getTime()).not.toBe(new Date(claimedPast).getTime());
  });

  test('an irrigation event never has endedAt before startedAt (open->close ordering)', async () => {
    const { accessToken, valve } = await fullSetup();
    const openRes = await request(app)
      .post(`/api/v1/irrigation/valves/${valve._id}/open`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedDurationSeconds: 30 });
    expect(openRes.status).toBe(202);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const closeRes = await request(app)
      .post(`/api/v1/irrigation/valves/${valve._id}/close`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(closeRes.status).toBe(202);

    const event = await IrrigationEvent.findOne({ valveId: valve._id });
    expect(event.startedAt).not.toBeNull();
    expect(event.endedAt).not.toBeNull();
    expect(event.endedAt.getTime()).toBeGreaterThanOrEqual(event.startedAt.getTime());
    expect(event.actualDurationSeconds).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------
// 3. Unit-naming consistency (static convention check)
// ---------------------------------------------------------------------
describe('Data collection contract — unit-naming consistency', () => {
  test('every new numeric telemetry reading field name encodes an explicit unit', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/modules/telemetry/telemetry.model.js'),
      'utf8'
    );
    const newFieldNames = [
      'soilEcMicrosiemensPerCm',
      'airTemperatureCelsius',
      'relativeHumidityPercent',
      'precipitationMm',
      'cumulativeVolumeLiters',
      'flowRateLitersPerMinute',
    ];
    const recognizedUnitSuffixes = [
      'Celsius',
      'Percent',
      'Ppt',
      'MicrosiemensPerCm',
      'Mm',
      'LitersPerMinute',
      'Liters',
    ];
    for (const name of newFieldNames) {
      expect(source).toContain(name);
      const hasUnitSuffix = recognizedUnitSuffixes.some((suffix) => name.endsWith(suffix));
      expect(hasUnitSuffix).toBe(true);
    }
  });

  test('IrrigationEvent.appliedWaterVolumeLiters encodes its unit and has a non-negative floor', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/modules/irrigation/irrigationEvent.model.js'),
      'utf8'
    );
    expect(source).toContain('appliedWaterVolumeLiters');
    expect(source).toMatch(/appliedWaterVolumeLiters:\s*\{\s*type:\s*Number,\s*min:\s*0/);
  });
});

// ---------------------------------------------------------------------
// 4. Event linkage
// ---------------------------------------------------------------------
describe('Data collection contract — event linkage', () => {
  test('applied water volume reported on the CLOSE_VALVE command is linked to the correct irrigation event', async () => {
    const { accessToken, device, valve } = await fullSetup();

    const openRes = await request(app)
      .post(`/api/v1/irrigation/valves/${valve._id}/open`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedDurationSeconds: 60 });
    const openCommandId = openRes.body.data.command._id;

    // Device confirms the open (no volume yet — meter reading is taken at close).
    await request(app)
      .post(`/api/v1/commands/${openCommandId}/result`)
      .set('X-Device-Id', device.deviceId)
      .set('X-Device-Key', device.deviceSecret)
      .send({ success: true, valveId: valve._id, confirmedValveState: 'open' });

    const closeRes = await request(app)
      .post(`/api/v1/irrigation/valves/${valve._id}/close`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    const closeCommandId = closeRes.body.data.command._id;

    const resultRes = await request(app)
      .post(`/api/v1/commands/${closeCommandId}/result`)
      .set('X-Device-Id', device.deviceId)
      .set('X-Device-Key', device.deviceSecret)
      .send({
        success: true,
        valveId: valve._id,
        confirmedValveState: 'closed',
        appliedWaterVolumeLiters: 42.5,
      });
    expect(resultRes.status).toBe(200);

    const event = await IrrigationEvent.findOne({ closeCommandId });
    expect(event).not.toBeNull();
    expect(event.appliedWaterVolumeLiters).toBe(42.5);
    expect(String(event.openCommandId)).toBe(String(openCommandId));

    // Never derived/estimated backend-side when not reported.
    const secondOpen = await request(app)
      .post(`/api/v1/irrigation/valves/${valve._id}/open`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedDurationSeconds: 30 });
    await request(app)
      .post(`/api/v1/irrigation/valves/${valve._id}/close`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    const secondEvent = await IrrigationEvent.findOne({ openCommandId: secondOpen.body.data.command._id });
    expect(secondEvent.appliedWaterVolumeLiters).toBeNull();
  });

  test('a device can be assigned a zone belonging to its own farm, but not a zone from another farm', async () => {
    const { accessToken, farmId, device } = await fullSetup();

    const zoneRes = await createZone(accessToken, farmId, { name: 'North Field', cropType: 'tomato' });
    expect(zoneRes.status).toBe(201);
    const zoneId = zoneRes.body.data._id;

    const assignRes = await request(app)
      .patch(`/api/v1/devices/${device.deviceId}/zone`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ zoneId });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.zoneId).toBe(zoneId);

    // A telemetry reading ingested after zone assignment carries the zoneId.
    const teleRes = await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', device.deviceId)
      .set('X-Device-Key', device.deviceSecret)
      .send({ messageId: 'zoned-reading', readings: { soilMoisturePercent: 50 } });
    expect(teleRes.status).toBe(200);
    const stored = await Telemetry.findOne({ deviceId: device.deviceId, messageId: 'zoned-reading' });
    expect(String(stored.zoneId)).toBe(String(zoneId));

    // Cross-farm assignment is refused.
    const otherAccessToken = await registerTechnician();
    const otherFarmId = await createFarm(otherAccessToken, 'Other Farm');
    const otherZoneRes = await createZone(otherAccessToken, otherFarmId, { name: 'Other Field' });
    const otherZoneId = otherZoneRes.body.data._id;

    const crossFarmRes = await request(app)
      .patch(`/api/v1/devices/${device.deviceId}/zone`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ zoneId: otherZoneId });
    expect(crossFarmRes.status).toBe(409);
  });

  test('a valve can be assigned a zone belonging to its own farm, but not a zone from another farm', async () => {
    const { accessToken, farmId, valve } = await fullSetup();

    const zoneRes = await createZone(accessToken, farmId, { name: 'South Field' });
    const zoneId = zoneRes.body.data._id;

    const assignRes = await request(app)
      .patch(`/api/v1/irrigation/valves/${valve._id}/zone`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ zoneId });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.zoneId).toBe(zoneId);

    const otherAccessToken = await registerTechnician();
    const otherFarmId = await createFarm(otherAccessToken, 'Another Farm');
    const otherZoneRes = await createZone(otherAccessToken, otherFarmId, { name: 'Another Field' });
    const otherZoneId = otherZoneRes.body.data._id;

    const crossFarmRes = await request(app)
      .patch(`/api/v1/irrigation/valves/${valve._id}/zone`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ zoneId: otherZoneId });
    expect(crossFarmRes.status).toBe(409);
  });
});

// ---------------------------------------------------------------------
// 5. Missing critical fields
// ---------------------------------------------------------------------
describe('Data collection contract — missing critical fields', () => {
  test('a telemetry payload with no readings at all is rejected', async () => {
    const { device } = await fullSetup();
    const res = await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', device.deviceId)
      .set('X-Device-Key', device.deviceSecret)
      .send({ messageId: 'no-readings', readings: {} });
    expect(res.status).toBe(400);
  });

  test('a zone cannot be created without a name', async () => {
    const { accessToken, farmId } = await fullSetup();
    const res = await createZone(accessToken, farmId, { cropType: 'tomato' });
    expect(res.status).toBe(400);
  });

  test('assigning a non-existent zoneId to a device is rejected with 404, never silently ignored', async () => {
    const { accessToken, device } = await fullSetup();
    const res = await request(app)
      .patch(`/api/v1/devices/${device.deviceId}/zone`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ zoneId: '000000000000000000000000' });
    expect(res.status).toBe(404);
  });
});
