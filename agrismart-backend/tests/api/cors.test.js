'use strict';

const request = require('supertest');

describe('CORS rejection classification (Stage 1 finding A2 fix)', () => {
  let app;

  beforeAll(() => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://allowed.example.com';
    jest.resetModules();
    const createApp = require('../../src/app');
    app = createApp();
  });

  test('an allowed origin gets the ACAO header and a normal response', async () => {
    const res = await request(app).get('/health/live').set('Origin', 'https://allowed.example.com');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://allowed.example.com');
  });

  test('a disallowed origin is NOT a 500 — it gets a normal status with no ACAO header', async () => {
    const res = await request(app).get('/health/live').set('Origin', 'https://evil.example.com');
    // The critical assertion: this must NOT be 500. The server still
    // executes the request normally; only the ACAO header is withheld,
    // which is what makes the BROWSER block the response client-side.
    expect(res.status).not.toBe(500);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('a request with no Origin header (mobile app / ESP32 / curl) is always allowed', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
  });
});
