'use strict';

const { PassThrough } = require('stream');
const pino = require('pino');

describe('Log redaction (Stage 1 finding C1 / Stage 2 section 5G)', () => {
  test('password, token, and deviceSecret fields are masked in log output', (done) => {
    const stream = new PassThrough();
    const logger = pino(
      {
        redact: {
          paths: ['password', 'token', 'deviceSecret', '*.password'],
          censor: '[REDACTED]',
        },
      },
      stream
    );

    let raw = '';
    stream.on('data', (chunk) => {
      raw += chunk.toString();
    });
    stream.on('end', () => {
      const line = JSON.parse(raw.trim());
      expect(line.password).toBe('[REDACTED]');
      expect(line.token).toBe('[REDACTED]');
      expect(line.deviceSecret).toBe('[REDACTED]');
      expect(raw).not.toContain('super-secret-password');
      expect(raw).not.toContain('super-secret-token');
      done();
    });

    logger.info({
      password: 'super-secret-password',
      token: 'super-secret-token',
      deviceSecret: 'super-secret-device-key',
      email: 'farmer@example.com',
    });

    stream.end();
  });
});
