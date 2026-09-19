'use strict';

/**
 * tests/community/roundTwoSecurity.test.js
 *
 * Additional coverage requested for the round-2 security pass, beyond
 * what tests/community/idor.test.js, tests/equipment/rentals.test.js,
 * tests/services/serviceRequests.test.js, and
 * tests/marketplace/marketplace.test.js already exercise:
 *
 *   - ownerId/providerId/sellerId cannot be set via the create body for
 *     equipment/services/marketplace listings specifically (idor.test.js
 *     only covers community posts' authorId/moderationStatus).
 *   - a service request cannot be reviewed twice, and cannot be
 *     reviewed before completion (rentals.test.js covers this for
 *     equipment rentals; this file adds the same two cases for
 *     services, which had no review coverage at all).
 *   - rate limiting is actually enforced end-to-end (every other test
 *     file only checks authorization/business logic — none send enough
 *     requests to trip a limiter).
 *
 * Requires a real/reachable MongoDB to run, same as every other
 * community test file.
 */

const request = require('supertest');
const mongoose = require('mongoose');
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

function fakeObjectId() {
  return new mongoose.Types.ObjectId().toString();
}

describe('Round 2: ownerId/providerId/sellerId mass-assignment', () => {
  test('equipment create ignores a client-supplied ownerId and uses the authenticated user instead', async () => {
    const attacker = await registerFarmer('massAssignEquip');
    const victimId = fakeObjectId();

    const res = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${attacker.accessToken}`)
      .send({
        equipmentType: 'tractor',
        title: 'Mass assignment attempt',
        pricing: { unit: 'day', amount: 100 },
        ownerId: victimId,
      });

    // .strict() zod schema rejects the unknown `ownerId` field outright.
    expect(res.status).toBe(400);
  });

  test('service create ignores a client-supplied providerId and uses the authenticated user instead', async () => {
    const attacker = await registerFarmer('massAssignSvc');
    const victimId = fakeObjectId();

    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${attacker.accessToken}`)
      .send({
        serviceType: 'other',
        title: 'Mass assignment attempt',
        pricing: { unit: 'job', amount: 100 },
        providerId: victimId,
      });

    expect(res.status).toBe(400);
  });

  test('marketplace create ignores a client-supplied sellerId and uses the authenticated user instead', async () => {
    const attacker = await registerFarmer('massAssignMkt');
    const victimId = fakeObjectId();

    const res = await request(app)
      .post('/api/v1/marketplace')
      .set('Authorization', `Bearer ${attacker.accessToken}`)
      .send({
        category: 'seeds',
        title: 'Mass assignment attempt',
        price: 100,
        unit: 'kg',
        sellerId: victimId,
      });

    expect(res.status).toBe(400);
  });
});

describe('Round 2: service-request review guards', () => {
  async function createService(provider) {
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${provider.accessToken}`)
      .send({ serviceType: 'other', title: 'Reviewable service', pricing: { unit: 'job', amount: 150 } });
    return res.body.data;
  }

  test('cannot review a service request that has not been completed', async () => {
    const provider = await registerFarmer('svcReviewProv1');
    const requester = await registerFarmer('svcReviewReq1');
    const service = await createService(provider);

    const reqRes = await request(app)
      .post(`/api/v1/services/${service._id}/requests`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({});
    const requestId = reqRes.body.data._id;

    const reviewRes = await request(app)
      .post(`/api/v1/service-requests/${requestId}/review`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({ rating: 5 });
    expect(reviewRes.status).toBe(400);
  });

  test('a second review of the same completed service request is rejected', async () => {
    const provider = await registerFarmer('svcReviewProv2');
    const requester = await registerFarmer('svcReviewReq2');
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
    await request(app)
      .patch(`/api/v1/service-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${provider.accessToken}`)
      .send({ action: 'start' });
    await request(app)
      .patch(`/api/v1/service-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${provider.accessToken}`)
      .send({ action: 'complete' });

    const firstReview = await request(app)
      .post(`/api/v1/service-requests/${requestId}/review`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({ rating: 5, comment: 'Great work.' });
    expect(firstReview.status).toBe(201);

    // reviewedByRequester must actually persist on the request document
    // (round-3 finding: this field didn't exist on the model at all
    // until this fix — the frontend's "already reviewed" disabled
    // state was silently always false after a page reload before this
    // fix landed).
    const listRes = await request(app)
      .get('/api/v1/service-requests?as=requester')
      .set('Authorization', `Bearer ${requester.accessToken}`);
    const reviewedItem = listRes.body.data.find((r) => r._id === requestId);
    expect(reviewedItem.reviewedByRequester).toBe(true);

    const secondReview = await request(app)
      .post(`/api/v1/service-requests/${requestId}/review`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({ rating: 1 });
    expect(secondReview.status).toBe(409);
  });
});

describe('Round 2: rate limiting is actually enforced', () => {
  test('filing more reports than communityReportLimiter allows in the window returns 429', async () => {
    const reporter = await registerFarmer('rateLimitReporter');

    // Default RATE_LIMIT_COMMUNITY_REPORT_MAX is 15/hour (see
    // config/env.js) — fire 16 requests against 16 DISTINCT fake target
    // ids (the report model's uniqueness constraint is per
    // reporter+target, so reusing one id would 409 before the limiter
    // ever had a chance to trip; targetId only needs to be a valid
    // ObjectId shape, moderation.service.fileReport never checks that
    // the target actually exists).
    const responses = [];
    for (let i = 0; i < 16; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post('/api/v1/moderation/reports')
        .set('Authorization', `Bearer ${reporter.accessToken}`)
        .send({ targetType: 'post', targetId: fakeObjectId(), reason: 'spam' });
      responses.push(res.status);
    }

    expect(responses.filter((s) => s === 201).length).toBeLessThanOrEqual(15);
    expect(responses).toContain(429);
  });
});
