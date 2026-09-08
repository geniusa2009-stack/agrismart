'use strict';

const request = require('supertest');
const createApp = require('../../src/app');

const app = createApp();

async function setupFarmAndDevice() {
  const email = `tech-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const registerRes = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'CorrectHorseBattery1',
    fullName: 'Technician',
    role: 'technician',
  });
  if (registerRes.status !== 201 || !registerRes.body.data) {
    // Fail with the actual server response instead of a bare
    // "Cannot read properties of undefined" a few lines down —
    // that TypeError hides the real cause (whatever status/error
    // the server actually returned) behind an unrelated stack frame.
    throw new Error(
      `setupFarmAndDevice(): registration did not return the expected shape. ` +
        `status=${registerRes.status} body=${JSON.stringify(registerRes.body)}`
    );
  }
  const accessToken = registerRes.body.data.accessToken;

  const farmRes = await request(app)
    .post('/api/v1/farms')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Test Farm' });
  const farmId = farmRes.body.data._id;

  const deviceRes = await request(app)
    .post('/api/v1/devices')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ farmId, name: 'Soil Sensor 1' });

  return {
    accessToken,
    farmId,
    deviceId: deviceRes.body.data.deviceId,
    deviceSecret: deviceRes.body.data.deviceSecret,
  };
}

describe('Device authentication', () => {
  test('provisioning returns a deviceId and deviceSecret exactly once', async () => {
    const { deviceId, deviceSecret } = await setupFarmAndDevice();
    expect(deviceId).toMatch(/^dev_/);
    expect(deviceSecret).toBeDefined();
    expect(deviceSecret.length).toBeGreaterThan(20);
  });

  test('telemetry ingestion with a missing device credential is rejected', async () => {
    const res = await request(app).post('/api/v1/telemetry').send({
      messageId: 'm1',
      readings: { soilMoisturePercent: 42 },
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('DEVICE_UNAUTHORIZED');
  });

  test('telemetry ingestion with a wrong device secret is rejected', async () => {
    const { deviceId } = await setupFarmAndDevice();
    const res = await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Key', 'totally-wrong-secret')
      .send({ messageId: 'm1', readings: { soilMoisturePercent: 42 } });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('DEVICE_UNAUTHORIZED');
  });

  test('a suspended device is rejected even with the correct secret', async () => {
    const { deviceId, deviceSecret, accessToken } = await setupFarmAndDevice();

    await request(app)
      .post(`/api/v1/devices/${deviceId}/suspend`)
      .set('Authorization', `Bearer ${accessToken}`);

    const res = await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Key', deviceSecret)
      .send({ messageId: 'm1', readings: { soilMoisturePercent: 42 } });

    expect(res.status).toBe(403);
  });
});

describe('Telemetry ingestion correctness', () => {
  test('a valid reading is accepted and stored', async () => {
    const { deviceId, deviceSecret } = await setupFarmAndDevice();
    const res = await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Key', deviceSecret)
      .send({ messageId: 'reading-1', readings: { soilMoisturePercent: 55 } });

    expect(res.status).toBe(200);
    expect(res.body.data.stored).toBe(true);
    expect(res.body.data.duplicate).toBe(false);
  });

  test('duplicate telemetry (same messageId) is idempotent, not an error', async () => {
    const { deviceId, deviceSecret } = await setupFarmAndDevice();
    const payload = { messageId: 'dup-1', readings: { soilMoisturePercent: 30 } };

    const first = await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Key', deviceSecret)
      .send(payload);
    const second = await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Key', deviceSecret)
      .send(payload);

    expect(first.status).toBe(200);
    expect(first.body.data.stored).toBe(true);
    expect(second.status).toBe(200);
    expect(second.body.data.duplicate).toBe(true);
    expect(second.body.data.stored).toBe(false);

    const Telemetry = require('../../src/modules/telemetry/telemetry.model');
    const count = await Telemetry.countDocuments({ deviceId, messageId: 'dup-1' });
    expect(count).toBe(1);
  });

  test('out-of-range readings are rejected with a validation error, never stored', async () => {
    const { deviceId, deviceSecret } = await setupFarmAndDevice();
    const res = await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Key', deviceSecret)
      .send({ messageId: 'bad-1', readings: { soilMoisturePercent: 250 } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('unknown/unexpected fields are rejected outright (strict schema)', async () => {
    const { deviceId, deviceSecret } = await setupFarmAndDevice();
    const res = await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Key', deviceSecret)
      .send({ messageId: 'strict-1', readings: { soilMoisturePercent: 40 }, unexpectedField: 'x' });

    expect(res.status).toBe(400);
  });

  test('a successful ingestion updates the device lastSeenAt (heartbeat side effect)', async () => {
    const { deviceId, deviceSecret } = await setupFarmAndDevice();
    await request(app)
      .post('/api/v1/telemetry')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Key', deviceSecret)
      .send({ messageId: 'hb-1', readings: { temperatureCelsius: 25 } });

    const Device = require('../../src/modules/devices/device.model');
    const device = await Device.findOne({ deviceId });
    expect(device.lastSeenAt).not.toBeNull();
  });
});
