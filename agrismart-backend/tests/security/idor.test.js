'use strict';

const request = require('supertest');
const createApp = require('../../src/app');

const app = createApp();

async function registerFarmer(label) {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'CorrectHorseBattery1',
    fullName: label,
  });
  return res.body.data;
}

describe('Anti-IDOR: farm ownership (Stage 2 section 6 requirement)', () => {
  test('farmer A cannot read farmer B\'s farm by guessing its id', async () => {
    const farmerA = await registerFarmer('farmerA');
    const farmerB = await registerFarmer('farmerB');

    const createRes = await request(app)
      .post('/api/v1/farms')
      .set('Authorization', `Bearer ${farmerB.accessToken}`)
      .send({ name: "Farmer B's Farm" });
    expect(createRes.status).toBe(201);
    const farmBId = createRes.body.data._id;

    const attackRes = await request(app)
      .get(`/api/v1/farms/${farmBId}`)
      .set('Authorization', `Bearer ${farmerA.accessToken}`);

    // Never 200 with the data, and never a 403 that would confirm the
    // id exists (Stage 2 section 6) — 404 either way.
    expect(attackRes.status).toBe(404);
    expect(attackRes.body.data).toBeUndefined();
  });

  test('the legitimate owner CAN read their own farm', async () => {
    const farmerB = await registerFarmer('farmerB2');
    const createRes = await request(app)
      .post('/api/v1/farms')
      .set('Authorization', `Bearer ${farmerB.accessToken}`)
      .send({ name: 'My Farm' });
    const farmId = createRes.body.data._id;

    const res = await request(app)
      .get(`/api/v1/farms/${farmId}`)
      .set('Authorization', `Bearer ${farmerB.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('My Farm');
  });

  test('requests without a valid access token are rejected', async () => {
    const res = await request(app).get('/api/v1/farms');
    expect(res.status).toBe(401);
  });
});
