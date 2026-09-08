'use strict';

const request = require('supertest');
const createApp = require('../../src/app');

const app = createApp();

async function setupFarmDeviceValve() {
  const email = `tech-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

  const registerRes = await request(app)
    .post('/api/v1/auth/register')
    .send({
      email,
      password: 'CorrectHorseBattery1',
      fullName: 'Technician',
      role: 'technician',
    });

  const accessToken = registerRes.body.data.accessToken;

  const farmRes = await request(app)
    .post('/api/v1/farms')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Irrigation Test Farm' });

  const farmId = farmRes.body.data._id;

  const deviceRes = await request(app)
    .post('/api/v1/devices')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ farmId, name: 'Valve Controller' });

  const deviceId = deviceRes.body.data.deviceId;

  const valveRes = await request(app)
    .post(`/api/v1/irrigation/farms/${farmId}/valves`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ deviceId, name: 'Main Valve' });

  return {
    accessToken,
    farmId,
    deviceId,
    valveId: valveRes.body.data._id,
  };
}

describe('Irrigation safety — max duration clamp', () => {
  test('a requested duration beyond the configured maximum is clamped, never trusted', async () => {
    const { accessToken, valveId } = await setupFarmDeviceValve();

    const res = await request(app)
      .post(`/api/v1/irrigation/valves/${valveId}/open`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedDurationSeconds: 3600 });

    expect(res.status).toBe(202);
    expect(res.body.data.durationSeconds).toBe(1800);
  });
});

describe('Irrigation safety — daily water allowance', () => {
  test('two opens that exactly exhaust the daily allowance succeed; a third is rejected', async () => {
    const { accessToken, valveId } = await setupFarmDeviceValve();

    const firstOpen = await request(app)
      .post(`/api/v1/irrigation/valves/${valveId}/open`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedDurationSeconds: 1800 });

    expect(firstOpen.status).toBe(202);
    expect(firstOpen.body.data.durationSeconds).toBe(1800);

    const secondOpen = await request(app)
      .post(`/api/v1/irrigation/valves/${valveId}/open`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedDurationSeconds: 1800 });

    expect(secondOpen.status).toBe(202);
    expect(secondOpen.body.data.durationSeconds).toBe(1800);

    const thirdOpen = await request(app)
      .post(`/api/v1/irrigation/valves/${valveId}/open`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedDurationSeconds: 60 });

    expect(thirdOpen.status).toBe(409);
    expect(thirdOpen.body.error.code).toBe('IRRIGATION_SAFETY_VIOLATION');
  });
});

describe('Irrigation safety — duplicate command protection', () => {
  test('the same idempotencyKey issuing OPEN_VALVE twice creates only one command', async () => {
    const { accessToken, valveId } = await setupFarmDeviceValve();
    const idempotencyKey = 'double-tap-key-1';

    const first = await request(app)
      .post(`/api/v1/irrigation/valves/${valveId}/open`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedDurationSeconds: 60, idempotencyKey });

    const second = await request(app)
      .post(`/api/v1/irrigation/valves/${valveId}/open`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedDurationSeconds: 60, idempotencyKey });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(first.body.data.command._id).toBe(second.body.data.command._id);
  });
});

describe('Irrigation safety — emergency stop', () => {
  test('emergency stop closes every valve on the farm and is not subject to the command rate limit', async () => {
    const { accessToken, farmId, valveId } = await setupFarmDeviceValve();

    await request(app)
      .post(`/api/v1/irrigation/valves/${valveId}/open`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedDurationSeconds: 300 });

    const res = await request(app)
      .post(`/api/v1/irrigation/farms/${farmId}/emergency-stop`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send();

    expect(res.status).toBe(202);
    expect(res.body.data.length).toBe(1);

    const Valve = require('../../src/modules/irrigation/valve.model');
    const valve = await Valve.findById(valveId);

    expect(valve.commandedState).toBe('closed');
  });
});

describe('Irrigation anti-IDOR', () => {
  test("a farmer cannot open a valve belonging to another farmer's farm", async () => {
    const owner = await setupFarmDeviceValve();

    const attackerEmail = `attacker-${Date.now()}@example.com`;

    const attackerRegister = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: attackerEmail,
        password: 'CorrectHorseBattery1',
        fullName: 'Attacker',
      });

    const attackerToken = attackerRegister.body.data.accessToken;

    const res = await request(app)
      .post(`/api/v1/irrigation/valves/${owner.valveId}/open`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ requestedDurationSeconds: 60 });

    expect(res.status).toBe(404);
  });
});
