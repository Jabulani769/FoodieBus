import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import type { FastifyInstance } from 'fastify';

export const registry = new Registry();

export const httpRequestCounter = new Counter({
  name: 'foodiebus_http_requests_total',
  help: 'Total HTTP requests processed, by method, route, and status class',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'foodiebus_http_request_duration_seconds',
  help: 'HTTP request duration in seconds, by method and route',
  labelNames: ['method', 'route'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const queueJobsGauge = new Gauge({
  name: 'foodiebus_queue_jobs',
  help: 'Current BullMQ job counts by queue name and status',
  labelNames: ['queue', 'status'] as const,
  registers: [registry],
});

export const dbPoolGauge = new Gauge({
  name: 'foodiebus_db_pool',
  help: 'Active database connection pool size',
  labelNames: ['kind'] as const,
  registers: [registry],
});

function routeFor(request: {
  routerPath?: string;
  url: string;
  routeOptions?: { url?: string };
}): string {
  const route = request.routeOptions?.url ?? request.routerPath;
  return route && route !== '/*' ? route : request.url;
}

export function initMetricsHooks(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.addHook('onResponse', async (request, reply) => {
    const route = routeFor(request);
    const statusClass = String(Math.floor(reply.statusCode / 100)) + 'xx';
    httpRequestCounter.inc({ method: request.method, route, status: statusClass });
    httpRequestDuration.observe({ method: request.method, route }, reply.elapsedTime / 1000);
  });
}

export async function getMetrics(): Promise<string> {
  return registry.metrics();
}
