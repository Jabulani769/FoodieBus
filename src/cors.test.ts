import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { FastifyInstance } from 'fastify';

// The dashboards (vendor/admin/financial on :5173-:5175) talk to the API
// cross-origin and use PATCH/PUT/DELETE for profile, menu, hours, trips,
// settlements, ... A preflight that omits those methods makes browsers block
// every such write while login (POST) keeps working — see vendor settings
// "Network error" incident. These tests pin the preflight behaviour.
describe('CORS preflight', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const methods = ['PATCH', 'PUT', 'DELETE', 'POST', 'GET'];

  it.each(methods)('OPTIONS preflight allows %s', async (method) => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/vendors/me/profile',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': method,
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(res.statusCode).toBe(204);
    const allowMethods = res.headers['access-control-allow-methods'] ?? '';
    expect(allowMethods).toContain(method);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
