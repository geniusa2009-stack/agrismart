'use strict';

const { normalizeIp } = require('../../src/middleware/rateLimiter');

describe('middleware/rateLimiter normalizeIp (Stage 1 finding B2 fix)', () => {
  test('IPv4 addresses are used as-is', () => {
    expect(normalizeIp('41.32.10.5')).toBe('41.32.10.5');
  });

  test('two IPv6 addresses in the same /64 normalize to the same key', () => {
    const a = normalizeIp('2001:db8:1234:5678:aaaa:bbbb:cccc:dddd');
    const b = normalizeIp('2001:db8:1234:5678:1111:2222:3333:4444');
    expect(a).toBe(b);
  });

  test('two IPv6 addresses in different /64s normalize to different keys', () => {
    const a = normalizeIp('2001:db8:1234:5678::1');
    const b = normalizeIp('2001:db8:9999:0000::1');
    expect(a).not.toBe(b);
  });
});
