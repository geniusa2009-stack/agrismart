'use strict';

/**
 * tests/ai/copilotRoute.test.js
 *
 * Route-level integration test for POST /api/v1/ai/copilot/:valveId/analyze
 * (ai.routes.js / ai.controller.js.postCopilotAnalyze). Proves this new
 * endpoint carries the SAME ownership/farm-isolation guarantees as
 * every other valve-scoped route (reuses irrigation's loadValve
 * middleware), and that it reports insufficient_data honestly rather
 * than fabricating a recommendation when GEMINI_API_KEY is unset in
 * the test environment (no external network call is ever made here).
 */

const request = require('supertest');
const createApp = require('../../src/app');

const app = createApp();

async function registerAndCreateValve(farmName) {
  const email = `copilot-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const registerRes = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'CorrectHorseBattery1', fullName: 'Copilot Tester', role: 'technician' });
  const accessToken = registerRes.body.data.accessToken;

  const farmRes = await request(app)
    .post('/api/v1/farms')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: farmName });
  const farmId = farmRes.body.data._id;

  const deviceRes = await request(app)
    .post('/api/v1/devices')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ farmId, name: 'Copilot Device' });
  const deviceId = deviceRes.body.data.deviceId;

  const valveRes = await request(app)
    .post(`/api/v1/irrigation/farms/${farmId}/valves`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ deviceId, name: 'Copilot Valve' });

  return { accessToken, farmId, deviceId, valveId: valveRes.body.data._id };
}

describe('POST /api/v1/ai/copilot/:valveId/analyze', () => {
  test('requires authentication', async () => {
    const res = await request(app).post('/api/v1/ai/copilot/000000000000000000000000/analyze');
    expect(res.status).toBe(401);
  });

  test("returns insufficient_data honestly (no fabricated recommendation) when the valve has no telemetry", async () => {
    const { accessToken, valveId } = await registerAndCreateValve('Copilot Farm A');

    const res = await request(app)
      .post(`/api/v1/ai/copilot/${valveId}/analyze`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('insufficient_data');
    expect(res.body.data.source).toBe('gemini');
  });

  test('a farm owner cannot analyze a valve belonging to a different farm/owner (cross-farm isolation, 404 not 403 — anti-IDOR)', async () => {
    const ownerA = await registerAndCreateValve('Copilot Farm Owner A');
    const ownerB = await registerAndCreateValve('Copilot Farm Owner B');

    const res = await request(app)
      .post(`/api/v1/ai/copilot/${ownerA.valveId}/analyze`)
      .set('Authorization', `Bearer ${ownerB.accessToken}`);

    expect(res.status).toBe(404);
  });

  test('a nonexistent valveId returns 404, not a leaked/fabricated response', async () => {
    const { accessToken } = await registerAndCreateValve('Copilot Farm C');
    const res = await request(app)
      .post('/api/v1/ai/copilot/000000000000000000000000/analyze')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });
});
