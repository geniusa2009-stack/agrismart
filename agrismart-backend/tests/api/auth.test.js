'use strict';

const request = require('supertest');
const createApp = require('../../src/app');

const app = createApp();

function uniqueEmail() {
  return `farmer-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

describe('Auth flow', () => {
  test('register -> returns 201 with access + refresh tokens', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: uniqueEmail(),
      password: 'CorrectHorseBattery1',
      fullName: 'Test Farmer',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.role).toBe('farmer');
  });

  test('register rejects a duplicate email with 409 CONFLICT_DUPLICATE', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'CorrectHorseBattery1',
      fullName: 'First',
    });
    const res = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'CorrectHorseBattery1',
      fullName: 'Second',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT_DUPLICATE');
  });

  test('login with wrong password returns 401 without leaking whether the account exists', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'CorrectHorseBattery1',
      fullName: 'Test',
    });

    const wrongPassword = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'WrongPassword1',
    });
    const noSuchAccount = await request(app).post('/api/v1/auth/login').send({
      email: uniqueEmail(),
      password: 'WrongPassword1',
    });

    expect(wrongPassword.status).toBe(401);
    expect(noSuchAccount.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(noSuchAccount.body.error.message);
  });

  test('refresh token rotates on use and the OLD token cannot be reused', async () => {
    const email = uniqueEmail();
    const registerRes = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'CorrectHorseBattery1',
      fullName: 'Test',
    });
    const originalRefreshToken = registerRes.body.data.refreshToken;

    const firstRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: originalRefreshToken });
    expect(firstRefresh.status).toBe(200);
    expect(firstRefresh.body.data.refreshToken).not.toBe(originalRefreshToken);

    // Reusing the now-rotated original token must fail with reuse
    // detection, not just "invalid" — and must revoke the family.
    const reuseAttempt = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: originalRefreshToken });
    expect(reuseAttempt.status).toBe(401);
    expect(reuseAttempt.body.error.code).toBe('AUTH_REFRESH_REUSE_DETECTED');

    // Reuse detection must have revoked the WHOLE family — even the
    // token issued by the legitimate first refresh is now dead.
    const secondRefreshToken = firstRefresh.body.data.refreshToken;
    const afterFamilyRevocation = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: secondRefreshToken });
    expect(afterFamilyRevocation.status).toBe(401);
  });

  test('a well-formed but unknown refresh token is rejected as invalid', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not-a-real-token-value-xyz' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });
});
