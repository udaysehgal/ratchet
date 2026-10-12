import { describe, expect, it } from 'vitest';
import { clientIp, createRateLimiter } from './rateLimit';

describe('createRateLimiter', () => {
  it('allows up to the limit per window, per key', () => {
    let t = 0;
    const allow = createRateLimiter(2, 1000, () => t);
    expect([allow('a'), allow('a'), allow('a')]).toEqual([true, true, false]);
    expect(allow('b')).toBe(true);
  });

  it('opens a new window once the old one ends', () => {
    let t = 0;
    const allow = createRateLimiter(1, 1000, () => t);
    expect(allow('a')).toBe(true);
    t = 999;
    expect(allow('a')).toBe(false);
    t = 1000;
    expect(allow('a')).toBe(true);
  });
});

describe('clientIp', () => {
  it('takes the first forwarded hop, then x-real-ip, then the socket', () => {
    expect(
      clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, socket: undefined } as never)
    ).toBe('1.2.3.4');
    expect(clientIp({ headers: { 'x-real-ip': '5.6.7.8' }, socket: undefined } as never)).toBe(
      '5.6.7.8'
    );
    expect(clientIp({ headers: {}, socket: { remoteAddress: '9.9.9.9' } } as never)).toBe(
      '9.9.9.9'
    );
  });
});
