'use strict';

/**
 * tests/community/idor.test.js
 *
 * Anti-IDOR + basic lifecycle coverage for the community layer (posts,
 * comments, follows) — mirrors the exact style/helpers of
 * tests/security/idor.test.js for the pre-existing IoT layer. Requires
 * a real/reachable MongoDB to run (same as every other supertest-based
 * test in this repo) — see README.md's "Tests" section.
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

describe('Community: posts ownership + lifecycle', () => {
  test('farmer A cannot edit farmer B\'s post', async () => {
    const farmerA = await registerFarmer('cpA');
    const farmerB = await registerFarmer('cpB');

    const createRes = await request(app)
      .post('/api/v1/community/posts')
      .set('Authorization', `Bearer ${farmerB.accessToken}`)
      .send({ body: "B's original post", category: 'general' });
    expect(createRes.status).toBe(201);
    const postId = createRes.body.data._id;

    const attackRes = await request(app)
      .patch(`/api/v1/community/posts/${postId}`)
      .set('Authorization', `Bearer ${farmerA.accessToken}`)
      .send({ body: 'hijacked' });

    expect(attackRes.status).toBe(404);
  });

  test('farmer A cannot delete farmer B\'s post', async () => {
    const farmerA = await registerFarmer('cpA2');
    const farmerB = await registerFarmer('cpB2');
    const createRes = await request(app)
      .post('/api/v1/community/posts')
      .set('Authorization', `Bearer ${farmerB.accessToken}`)
      .send({ body: 'to be protected', category: 'general' });
    const postId = createRes.body.data._id;

    const attackRes = await request(app)
      .delete(`/api/v1/community/posts/${postId}`)
      .set('Authorization', `Bearer ${farmerA.accessToken}`);

    expect(attackRes.status).toBe(404);
  });

  test('a plain farmer cannot moderate (hide) any post', async () => {
    const farmerA = await registerFarmer('cpA3');
    const farmerB = await registerFarmer('cpB3');
    const createRes = await request(app)
      .post('/api/v1/community/posts')
      .set('Authorization', `Bearer ${farmerB.accessToken}`)
      .send({ body: 'plain post', category: 'general' });
    const postId = createRes.body.data._id;

    const attackRes = await request(app)
      .patch(`/api/v1/community/posts/${postId}/moderate`)
      .set('Authorization', `Bearer ${farmerA.accessToken}`)
      .send({ status: 'hidden' });

    // authorizeRole rejects before ownership is even checked — 403,
    // not 404, since this is a role gate, not a per-resource one.
    expect(attackRes.status).toBe(403);
  });

  test('the legitimate author CAN edit and soft-delete their own post', async () => {
    const farmer = await registerFarmer('cpSelf');
    const createRes = await request(app)
      .post('/api/v1/community/posts')
      .set('Authorization', `Bearer ${farmer.accessToken}`)
      .send({ body: 'my own post', category: 'irrigation' });
    const postId = createRes.body.data._id;

    const editRes = await request(app)
      .patch(`/api/v1/community/posts/${postId}`)
      .set('Authorization', `Bearer ${farmer.accessToken}`)
      .send({ body: 'edited by owner' });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.body).toBe('edited by owner');

    const deleteRes = await request(app)
      .delete(`/api/v1/community/posts/${postId}`)
      .set('Authorization', `Bearer ${farmer.accessToken}`);
    expect(deleteRes.status).toBe(204);

    // A soft-deleted post is no longer publicly visible.
    const getRes = await request(app)
      .get(`/api/v1/community/posts/${postId}`)
      .set('Authorization', `Bearer ${farmer.accessToken}`);
    expect(getRes.status).toBe(404);
  });

  test('mass-assignment: moderationStatus/authorId cannot be set via the create/update body', async () => {
    const farmer = await registerFarmer('cpMass');
    const res = await request(app)
      .post('/api/v1/community/posts')
      .set('Authorization', `Bearer ${farmer.accessToken}`)
      .send({ body: 'attempted mass assignment', category: 'general', moderationStatus: 'removed', authorId: '000000000000000000000000' });

    // .strict() zod schemas reject unknown fields outright.
    expect(res.status).toBe(400);
  });
});

describe('Community: comments ownership', () => {
  test('farmer A cannot edit or delete farmer B\'s comment', async () => {
    const farmerA = await registerFarmer('ccA');
    const farmerB = await registerFarmer('ccB');

    const postRes = await request(app)
      .post('/api/v1/community/posts')
      .set('Authorization', `Bearer ${farmerA.accessToken}`)
      .send({ body: 'a post to comment on', category: 'general' });
    const postId = postRes.body.data._id;

    const commentRes = await request(app)
      .post(`/api/v1/community/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${farmerB.accessToken}`)
      .send({ body: "B's comment" });
    expect(commentRes.status).toBe(201);
    const commentId = commentRes.body.data._id;

    const attackRes = await request(app)
      .patch(`/api/v1/community/comments/${commentId}`)
      .set('Authorization', `Bearer ${farmerA.accessToken}`)
      .send({ body: 'hijacked comment' });
    expect(attackRes.status).toBe(404);

    const deleteAttackRes = await request(app)
      .delete(`/api/v1/community/comments/${commentId}`)
      .set('Authorization', `Bearer ${farmerA.accessToken}`);
    expect(deleteAttackRes.status).toBe(404);
  });
});

describe('Community: follows', () => {
  test('a farmer cannot follow themselves', async () => {
    const farmer = await registerFarmer('cfSelf');
    const res = await request(app)
      .post(`/api/v1/community/follows/${farmer.user.id}`)
      .set('Authorization', `Bearer ${farmer.accessToken}`);
    expect(res.status).toBe(400);
  });

  test('following twice is idempotent, not an error', async () => {
    const farmerA = await registerFarmer('cfA');
    const farmerB = await registerFarmer('cfB');

    const first = await request(app)
      .post(`/api/v1/community/follows/${farmerB.user.id}`)
      .set('Authorization', `Bearer ${farmerA.accessToken}`);
    expect(first.status).toBe(204);

    const second = await request(app)
      .post(`/api/v1/community/follows/${farmerB.user.id}`)
      .set('Authorization', `Bearer ${farmerA.accessToken}`);
    expect(second.status).toBe(204);

    const profileRes = await request(app)
      .get(`/api/v1/community/profiles/${farmerB.user.id}`)
      .set('Authorization', `Bearer ${farmerA.accessToken}`);
    expect(profileRes.body.data.followerCount).toBe(1);
  });
});
