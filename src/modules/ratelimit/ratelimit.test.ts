import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';

describe('rate limiting', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({}, { rateLimitEnabled: true });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('auth login is limited to 10 attempts per minute per IP', async () => {
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { identifier: 'nonexistent@example.com', password: 'wrongpass' },
        headers: { 'x-forwarded-for': '203.0.113.55' },
      });
      if (res.statusCode === 429) {
        limited = true;
        const body = res.json();
        expect(body.error.code).toBe('RATE_LIMITED');
        break;
      }
    }
    expect(limited).toBe(true);
  });
});
