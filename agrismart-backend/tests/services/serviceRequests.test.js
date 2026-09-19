'use strict';

/**
 * tests/services/serviceRequests.test.js
 * Ownership/IDOR + lifecycle coverage for the agricultural services
 * module, mirroring tests/equipment/rentals.test.js's structure.
 * Requires a real/reachable MongoDB to run.
 */

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

async function createService(provider, overrides = {}) {
  const res = await request(app)
    .post('/api/v1/services')
    .set('Authorization', `Bearer ${provider.accessToken}`)
    .send({
      serviceType: 'irrigation_technician',
      title: 'Irrigation system repair',
      pricing: { unit: 'job', amount: 300 },
      ...overrides,
    });
  return res.body.data;
}

describe('Agricultural services: ownership + lifecycle', () => {
  test('provider A cannot edit provider B\'s service listing', async () => {
    const providerB = await registerFarmer('svcOwnerB');
    const attackerA = await registerFarmer('svcAttackerA');
    const service = await createService(providerB);

    const res = await request(app)
      .patch(`/api/v1/services/${service._id}`)
      .set('Authorization', `Bearer ${attackerA.accessToken}`)
      .send({ title: 'hijacked' });
    expect(res.status).toBe(404);
  });

  test('a provider cannot request their own service', async () => {
    const provider = await registerFarmer('svcSelf');
    const service = await createService(provider);
    const res = await request(app)
      .post(`/api/v1/services/${service._id}/requests`)
      .set('Authorization', `Bearer ${provider.accessToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('only the provider can accept a service request; an unrelated user gets 404', async () => {
    const provider = await registerFarmer('svcProv1');
    const requester = await registerFarmer('svcReq1');
    const attacker = await registerFarmer('svcAtt1');
    const service = await createService(provider);

    const reqRes = await request(app)
      .post(`/api/v1/services/${service._id}/requests`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({ message: 'Please come fix my drip line.' });
    expect(reqRes.status).toBe(201);
    const requestId = reqRes.body.data._id;

    const attackRes = await request(app)
      .patch(`/api/v1/service-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${attacker.accessToken}`)
      .send({ action: 'accept' });
    expect(attackRes.status).toBe(404);

    const requesterAcceptRes = await request(app)
      .patch(`/api/v1/service-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({ action: 'accept' });
    expect(requesterAcceptRes.status).toBe(403);

    const acceptRes = await request(app)
      .patch(`/api/v1/service-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${provider.accessToken}`)
      .send({ action: 'accept' });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.status).toBe('accepted');
  });

  test('full lifecycle: accept -> start -> complete, then invalid re-transition is rejected', async () => {
    const provider = await registerFarmer('svcProv2');
    const requester = await registerFarmer('svcReq2');
    const service = await createService(provider);

    const reqRes = await request(app)
      .post(`/api/v1/services/${service._id}/requests`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({});
    const requestId = reqRes.body.data._id;

    await request(app)
      .patch(`/api/v1/service-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${provider.accessToken}`)
      .send({ action: 'accept' });

    const startRes = await request(app)
      .patch(`/api/v1/service-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${provider.accessToken}`)
      .send({ action: 'start' });
    expect(startRes.status).toBe(200);
    expect(startRes.body.data.status).toBe('in_progress');

    const completeRes = await request(app)
      .patch(`/api/v1/service-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${provider.accessToken}`)
      .send({ action: 'complete' });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.status).toBe('completed');

    // Cannot start an already-completed request.
    const invalidRes = await request(app)
      .patch(`/api/v1/service-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${provider.accessToken}`)
      .send({ action: 'start' });
    expect(invalidRes.status).toBe(409);
  });
});
