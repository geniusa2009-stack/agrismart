'use strict';

/**
 * tests/equipment/rentals.test.js
 *
 * Covers the task brief's explicit negative-case checklist (section
 * 21/22) for the equipment rental module: ownership/IDOR, "cannot rent
 * own equipment", double-booking prevention, and invalid state
 * transitions. Requires a real/reachable MongoDB to run.
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

async function createEquipment(owner, overrides = {}) {
  const res = await request(app)
    .post('/api/v1/equipment')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({
      equipmentType: 'tractor',
      title: 'John Deere 5075E',
      pricing: { unit: 'day', amount: 500 },
      location: { governorate: 'Fayoum' },
      ...overrides,
    });
  return res.body.data;
}

function iso(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

describe('Equipment: ownership + IDOR', () => {
  test('farmer A cannot edit or archive farmer B\'s equipment listing', async () => {
    const owner = await registerFarmer('eqOwnerA');
    const attacker = await registerFarmer('eqAttackerA');
    const equipment = await createEquipment(owner);

    const editRes = await request(app)
      .patch(`/api/v1/equipment/${equipment._id}`)
      .set('Authorization', `Bearer ${attacker.accessToken}`)
      .send({ title: 'hijacked' });
    expect(editRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/v1/equipment/${equipment._id}`)
      .set('Authorization', `Bearer ${attacker.accessToken}`);
    expect(deleteRes.status).toBe(404);
  });

  test('equipmentType/pricing enum validation rejects an impossible value', async () => {
    const owner = await registerFarmer('eqBadEnum');
    const res = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ equipmentType: 'spaceship', pricing: { unit: 'day', amount: 100 } });
    expect(res.status).toBe(400);
  });

  test('a negative price is rejected', async () => {
    const owner = await registerFarmer('eqNegPrice');
    const res = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ equipmentType: 'tractor', pricing: { unit: 'day', amount: -50 } });
    expect(res.status).toBe(400);
  });
});

describe('Rental requests: business rules', () => {
  test('an owner cannot rent their own equipment', async () => {
    const owner = await registerFarmer('rrSelf');
    const equipment = await createEquipment(owner);

    const res = await request(app)
      .post(`/api/v1/equipment/${equipment._id}/rental-requests`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ startDate: iso(1), endDate: iso(2) });

    expect(res.status).toBe(400);
  });

  test('farmer A cannot accept/reject a rental request on farmer B\'s equipment (only the owner can)', async () => {
    const owner = await registerFarmer('rrOwnerB');
    const requester = await registerFarmer('rrReqB');
    const attacker = await registerFarmer('rrAttB');
    const equipment = await createEquipment(owner);

    const reqRes = await request(app)
      .post(`/api/v1/equipment/${equipment._id}/rental-requests`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({ startDate: iso(1), endDate: iso(2) });
    expect(reqRes.status).toBe(201);
    const rentalId = reqRes.body.data._id;

    // Unrelated attacker isn't even a participant — 404 (anti-enumeration).
    const attackRes = await request(app)
      .patch(`/api/v1/rentals/${rentalId}/status`)
      .set('Authorization', `Bearer ${attacker.accessToken}`)
      .send({ action: 'accept' });
    expect(attackRes.status).toBe(404);

    // The requester IS a participant (can cancel) but is NOT the owner
    // — accept must still be rejected, this time with 403 from the
    // service-layer role check.
    const requesterAcceptRes = await request(app)
      .patch(`/api/v1/rentals/${rentalId}/status`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({ action: 'accept' });
    expect(requesterAcceptRes.status).toBe(403);
  });

  test('double-booking is prevented: a second overlapping request cannot be accepted once one is already accepted', async () => {
    const owner = await registerFarmer('rrDoubleOwner');
    const requester1 = await registerFarmer('rrDouble1');
    const requester2 = await registerFarmer('rrDouble2');
    const equipment = await createEquipment(owner);

    const start = iso(5);
    const end = iso(7);

    const req1 = await request(app)
      .post(`/api/v1/equipment/${equipment._id}/rental-requests`)
      .set('Authorization', `Bearer ${requester1.accessToken}`)
      .send({ startDate: start, endDate: end });
    const req2 = await request(app)
      .post(`/api/v1/equipment/${equipment._id}/rental-requests`)
      .set('Authorization', `Bearer ${requester2.accessToken}`)
      .send({ startDate: start, endDate: end });
    expect(req1.status).toBe(201);
    expect(req2.status).toBe(201);

    const accept1 = await request(app)
      .patch(`/api/v1/rentals/${req1.body.data._id}/status`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ action: 'accept' });
    expect(accept1.status).toBe(200);
    expect(accept1.body.data.status).toBe('accepted');

    const accept2 = await request(app)
      .patch(`/api/v1/rentals/${req2.body.data._id}/status`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ action: 'accept' });
    expect(accept2.status).toBe(409);
  });

  test('a new request cannot be created for dates already covered by an accepted booking', async () => {
    const owner = await registerFarmer('rrBookedOwner');
    const requester1 = await registerFarmer('rrBooked1');
    const requester2 = await registerFarmer('rrBooked2');
    const equipment = await createEquipment(owner);
    const start = iso(10);
    const end = iso(12);

    const req1 = await request(app)
      .post(`/api/v1/equipment/${equipment._id}/rental-requests`)
      .set('Authorization', `Bearer ${requester1.accessToken}`)
      .send({ startDate: start, endDate: end });
    await request(app)
      .patch(`/api/v1/rentals/${req1.body.data._id}/status`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ action: 'accept' });

    const req2 = await request(app)
      .post(`/api/v1/equipment/${equipment._id}/rental-requests`)
      .set('Authorization', `Bearer ${requester2.accessToken}`)
      .send({ startDate: start, endDate: end });
    expect(req2.status).toBe(409);
  });

  test('invalid state transition: cannot accept a request that was already rejected', async () => {
    const owner = await registerFarmer('rrInvalidOwner');
    const requester = await registerFarmer('rrInvalidReq');
    const equipment = await createEquipment(owner);

    const reqRes = await request(app)
      .post(`/api/v1/equipment/${equipment._id}/rental-requests`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({ startDate: iso(20), endDate: iso(21) });
    const rentalId = reqRes.body.data._id;

    const rejectRes = await request(app)
      .patch(`/api/v1/rentals/${rentalId}/status`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ action: 'reject' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('rejected');

    const lateAcceptRes = await request(app)
      .patch(`/api/v1/rentals/${rentalId}/status`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ action: 'accept' });
    expect(lateAcceptRes.status).toBe(409);
  });

  test('full happy path: request -> accept -> complete -> review, and a second review is rejected', async () => {
    const owner = await registerFarmer('rrHappyOwner');
    const requester = await registerFarmer('rrHappyReq');
    const equipment = await createEquipment(owner);

    const reqRes = await request(app)
      .post(`/api/v1/equipment/${equipment._id}/rental-requests`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({ startDate: iso(30), endDate: iso(31) });
    const rentalId = reqRes.body.data._id;

    await request(app)
      .patch(`/api/v1/rentals/${rentalId}/status`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ action: 'accept' });

    // The requester cannot mark it completed — only the owner can.
    const requesterCompleteRes = await request(app)
      .patch(`/api/v1/rentals/${rentalId}/status`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({ action: 'complete' });
    expect(requesterCompleteRes.status).toBe(403);

    const completeRes = await request(app)
      .patch(`/api/v1/rentals/${rentalId}/status`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ action: 'complete' });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.status).toBe('completed');

    // Cannot review before completion is moot here (already completed) —
    // but the owner (not the requester) must not be able to review.
    const ownerReviewRes = await request(app)
      .post(`/api/v1/rentals/${rentalId}/review`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ rating: 5 });
    expect(ownerReviewRes.status).toBe(403);

    const reviewRes = await request(app)
      .post(`/api/v1/rentals/${rentalId}/review`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({ rating: 5, comment: 'Great tractor!' });
    expect(reviewRes.status).toBe(201);

    const secondReviewRes = await request(app)
      .post(`/api/v1/rentals/${rentalId}/review`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({ rating: 4 });
    expect(secondReviewRes.status).toBe(409);
  });

  test('cannot review a rental that has not been completed', async () => {
    const owner = await registerFarmer('rrEarlyOwner');
    const requester = await registerFarmer('rrEarlyReq');
    const equipment = await createEquipment(owner);

    const reqRes = await request(app)
      .post(`/api/v1/equipment/${equipment._id}/rental-requests`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({ startDate: iso(40), endDate: iso(41) });
    const rentalId = reqRes.body.data._id;

    const earlyReviewRes = await request(app)
      .post(`/api/v1/rentals/${rentalId}/review`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({ rating: 5 });
    expect(earlyReviewRes.status).toBe(400);
  });
});
