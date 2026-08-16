import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';

describe('metrics endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /metrics returns Prometheus-format text with http counters', async () => {
    await app.inject({ method: 'GET', url: '/api/v1/health' });

    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    const body = res.body;
    expect(body).toContain('foodiebus_http_requests_total');
    expect(body).toContain('foodiebus_http_request_duration_seconds');
    expect(body).toContain('method="GET"');
  });

  it('echoes an incoming x-request-id header back on the response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'x-request-id': 'test-req-123' },
    });
    expect(res.headers['x-request-id']).toBe('test-req-123');
  });
});
