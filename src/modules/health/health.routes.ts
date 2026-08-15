import type { FastifyInstance } from 'fastify';
import { env } from '../../shared/config/env.js';

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  checks: {
    database: 'ok' | 'down';
    redis: 'ok' | 'down';
    paychangu: 'ok' | 'down' | 'not_configured';
  };
  timestamp: string;
}

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Liveness + dependency health check',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ok', 'degraded'] },
              uptime: { type: 'number' },
              checks: {
                type: 'object',
                properties: {
                  database: { type: 'string', enum: ['ok', 'down'] },
                  redis: { type: 'string', enum: ['ok', 'down'] },
                  paychangu: { type: 'string', enum: ['ok', 'down', 'not_configured'] },
                },
                required: ['database', 'redis', 'paychangu'],
              },
              timestamp: { type: 'string' },
            },
            required: ['status', 'uptime', 'checks', 'timestamp'],
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['degraded'] },
              uptime: { type: 'number' },
              checks: {
                type: 'object',
                properties: {
                  database: { type: 'string', enum: ['ok', 'down'] },
                  redis: { type: 'string', enum: ['ok', 'down'] },
                  paychangu: { type: 'string', enum: ['ok', 'down', 'not_configured'] },
                },
                required: ['database', 'redis', 'paychangu'],
              },
              timestamp: { type: 'string' },
            },
            required: ['status', 'uptime', 'checks', 'timestamp'],
          },
        },
      },
    },
    async (_request, reply): Promise<void> => {
      const checks: HealthResponse['checks'] = {
        database: 'down',
        redis: 'down',
        paychangu: 'not_configured',
      };

      try {
        await app.prisma.$queryRaw`SELECT 1`;
        checks.database = 'ok';
      } catch (err) {
        app.log.error({ err }, 'database health check failed');
      }

      try {
        await app.redis.ping();
        checks.redis = 'ok';
      } catch (err) {
        app.log.error({ err }, 'redis health check failed');
      }

      if (!env.PAYCHANGU_SECRET_KEY) {
        checks.paychangu = 'not_configured';
      } else {
        try {
          const res = await fetch(`${env.PAYCHANGU_BASE_URL}/ping`);
          checks.paychangu = res.ok ? 'ok' : 'down';
        } catch (err) {
          app.log.error({ err }, 'paychangu health check failed');
          checks.paychangu = 'down';
        }
      }

      const status =
        checks.database === 'ok' &&
        checks.redis === 'ok' &&
        (checks.paychangu === 'ok' || checks.paychangu === 'not_configured')
          ? 'ok'
          : 'degraded';

      const body: HealthResponse = {
        status,
        uptime: process.uptime(),
        checks,
        timestamp: new Date().toISOString(),
      };

      const httpCode = status === 'ok' ? 200 : 503;
      reply.status(httpCode).send(body);
    },
  );
}
