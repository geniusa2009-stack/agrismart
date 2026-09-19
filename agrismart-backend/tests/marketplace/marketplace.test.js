'use strict';

/**
 * tests/marketplace/marketplace.test.js
 * Ownership/IDOR coverage for marketplace listings + moderation report
 * duplicate-spam prevention. Requires a real/reachable MongoDB to run.
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

async function createListing(seller, overrides = {}) {
  const res = await request(app)
    .post('/api/v1/marketplace')
    .set('Authorization', `Bearer ${seller.accessToken}`)
    .send({ category: 'seeds', title: 'Wheat seeds', price: 50, unit: 'kg', ...overrides });
  return res.body.data;
}

describe('Marketplace: ownership + IDOR', () => {
  test('seller A cannot edit or archive seller B\'s listing', async () => {
    const sellerB = await registerFarmer('mktOwnerB');
    const attackerA = await registerFarmer('mktAttackerA');
    const listing = await createListing(sellerB);

    const editRes = await request(app)
      .patch(`/api/v1/marketplace/${listing._id}`)
      .set('Authorization', `Bearer ${attackerA.accessToken}`)
      .send({ price: 1 });
    expect(editRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/v1/marketplace/${listing._id}`)
      .set('Authorization', `Bearer ${attackerA.accessToken}`);
    expect(deleteRes.status).toBe(404);
  });

  test('a seller cannot contact themselves about their own listing', async () => {
    const seller = await registerFarmer('mktSelfContact');
    const listing = await createListing(seller);
    const res = await request(app)
      .post(`/api/v1/marketplace/${listing._id}/contact`)
      .set('Authorization', `Bearer ${seller.accessToken}`)
      .send({ message: 'hi' });
    expect(res.status).toBe(400);
  });

  test('a buyer CAN contact a seller about an active listing', async () => {
    const seller = await registerFarmer('mktSeller');
    const buyer = await registerFarmer('mktBuyer');
    const listing = await createListing(seller);
    const res = await request(app)
      .post(`/api/v1/marketplace/${listing._id}/contact`)
      .set('Authorization', `Bearer ${buyer.accessToken}`)
      .send({ message: 'Is this still available?' });
    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(true);
  });

  test('saving a listing twice toggles it off, not an error/duplicate', async () => {
    const seller = await registerFarmer('mktSaveSeller');
    const buyer = await registerFarmer('mktSaveBuyer');
    const listing = await createListing(seller);

    const first = await request(app)
      .post(`/api/v1/marketplace/${listing._id}/save`)
      .set('Authorization', `Bearer ${buyer.accessToken}`);
    expect(first.body.data.saved).toBe(true);

    const second = await request(app)
      .post(`/api/v1/marketplace/${listing._id}/save`)
      .set('Authorization', `Bearer ${buyer.accessToken}`);
    expect(second.body.data.saved).toBe(false);
  });
});

describe('Moderation: report duplicate-spam prevention', () => {
  test('reporting the same target twice from the same user is rejected as a conflict', async () => {
    const seller = await registerFarmer('modSeller');
    const reporter = await registerFarmer('modReporter');
    const listing = await createListing(seller);

    const first = await request(app)
      .post('/api/v1/moderation/reports')
      .set('Authorization', `Bearer ${reporter.accessToken}`)
      .send({ targetType: 'marketplace_listing', targetId: listing._id, reason: 'scam_fraud' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/moderation/reports')
      .set('Authorization', `Bearer ${reporter.accessToken}`)
      .send({ targetType: 'marketplace_listing', targetId: listing._id, reason: 'spam' });
    expect(second.status).toBe(409);
  });

  test('a plain farmer cannot access the moderation queue', async () => {
    const farmer = await registerFarmer('modPlainFarmer');
    const res = await request(app)
      .get('/api/v1/moderation/reports')
      .set('Authorization', `Bearer ${farmer.accessToken}`);
    expect(res.status).toBe(403);
  });
});
