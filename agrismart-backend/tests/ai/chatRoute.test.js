'use strict';

/**
 * tests/ai/chatRoute.test.js
 *
 * Route-level integration test for POST /api/v1/ai/chat
 * (ai.routes.js / ai.controller.js.postChatMessage) — the global AI
 * farm assistant reachable from any authenticated page. Proves
 * authentication, request validation, and farm/zone ownership
 * isolation (anti-IDOR: 404, never a leaked 403) at the real HTTP
 * layer. No GEMINI_API_KEY is set in this test environment, so every
 * successful request here exercises the honest "unavailable" path —
 * live Gemini is never called from the test suite (spec section 22).
 */

const request = require('supertest');
const createApp = require('../../src/app');

const app = createApp();

async function registerAndCreateFarm(farmName) {
  const email = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const registerRes = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'CorrectHorseBattery1', fullName: 'Chat Tester', role: 'technician' });
  const accessToken = registerRes.body.data.accessToken;

  const farmRes = await request(app)
    .post('/api/v1/farms')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: farmName });
  const farmId = farmRes.body.data._id;

  return { accessToken, farmId };
}

describe('POST /api/v1/ai/chat', () => {
  test('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/ai/chat')
      .send({ message: 'أروي ولا لأ؟', farmId: '000000000000000000000000' });
    expect(res.status).toBe(401);
  });

  test('rejects a request missing the required message/farmId fields', async () => {
    const { accessToken } = await registerAndCreateFarm('Chat Farm Validation');
    const res = await request(app)
      .post('/api/v1/ai/chat')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('rejects an unknown/extra body field (mass-assignment defense, .strict() schema)', async () => {
    const { accessToken, farmId } = await registerAndCreateFarm('Chat Farm Strict');
    const res = await request(app)
      .post('/api/v1/ai/chat')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ message: 'hi', farmId, ownerId: '000000000000000000000000' });
    expect(res.status).toBe(400);
  });

  test('answers honestly (unavailable, not fabricated) for a farm the user actually owns, with no API key configured', async () => {
    const { accessToken, farmId } = await registerAndCreateFarm('Chat Farm Owner');
    const res = await request(app)
      .post('/api/v1/ai/chat')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ message: 'أروي ولا لأ؟', farmId, context: 'irrigation', locale: 'ar-eg' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('unavailable');
    expect(res.body.data.source).toBe('gemini');
  });

  test('a user cannot chat about a farm belonging to someone else (cross-farm isolation, 404 not 403 — anti-IDOR)', async () => {
    const ownerA = await registerAndCreateFarm('Chat Farm A');
    const ownerB = await registerAndCreateFarm('Chat Farm B');

    const res = await request(app)
      .post('/api/v1/ai/chat')
      .set('Authorization', `Bearer ${ownerB.accessToken}`)
      .send({ message: 'إيه حالة الأرض؟', farmId: ownerA.farmId });

    expect(res.status).toBe(404);
  });

  test('a zone belonging to a DIFFERENT farm than the one supplied is rejected, not silently mixed in', async () => {
    const ownerA = await registerAndCreateFarm('Chat Zone Farm A');
    const ownerB = await registerAndCreateFarm('Chat Zone Farm B');

    const zoneRes = await request(app)
      .post(`/api/v1/farms/${ownerB.farmId}/zones`)
      .set('Authorization', `Bearer ${ownerB.accessToken}`)
      .send({ name: 'Zone B1' });
    const zoneIdOnFarmB = zoneRes.body.data._id;

    const res = await request(app)
      .post('/api/v1/ai/chat')
      .set('Authorization', `Bearer ${ownerA.accessToken}`)
      .send({ message: 'إيه حالة المنطقة دي؟', farmId: ownerA.farmId, zoneId: zoneIdOnFarmB });

    expect(res.status).toBe(404);
  });

  test('a nonexistent farmId returns 404, not a leaked/fabricated response', async () => {
    const { accessToken } = await registerAndCreateFarm('Chat Farm Nonexistent');
    const res = await request(app)
      .post('/api/v1/ai/chat')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ message: 'test', farmId: '000000000000000000000000' });
    expect(res.status).toBe(404);
  });
});
