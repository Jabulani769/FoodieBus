import type { FastifyInstance } from 'fastify';
import { getMetrics, registry } from '../../shared/metrics/index.js';

export async function registerMetricsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/metrics', async (_request, reply) => {
    const metrics = await getMetrics();
    reply.header('Content-Type', registry.contentType);
    reply.send(metrics);
  });
}
