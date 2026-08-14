import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';

describe('health endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns status ok when dependencies are up', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.checks.database).toBe('ok');
    expect(body.checks.redis).toBe('ok');
    expect(typeof body.uptime).toBe('number');
  });

  it('returns a valid ISO timestamp', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    const body = res.json();
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });
});
