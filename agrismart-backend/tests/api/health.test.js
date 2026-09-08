'use strict';

const request = require('supertest');
const createApp = require('../../src/app');

describe('GET /health', () => {
  const app = createApp();

  test('/health/live returns 200 while the process is up', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('live');
  });

  test('/health/ready returns 200 when MongoDB is connected', async () => {
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.dependencies.mongodb.readyState).toBe(1);
  });

  test('unknown route returns a well-formed 404 JSON error, not HTML', async () => {
    const res = await request(app).get('/no-such-route');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeDefined();
  });
});
