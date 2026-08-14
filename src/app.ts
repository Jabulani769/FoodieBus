import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import sensible from '@fastify/sensible';
import { logger } from './shared/logger/index.js';
import { errorHandler } from './shared/errors/index.js';
import { prisma } from './shared/db/prisma.js';
import { redis } from './shared/redis/index.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';

export async function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify({
    loggerInstance: options.loggerInstance ?? logger,
    ...options,
  });

  app.setErrorHandler(errorHandler);

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(sensible);

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'FoodieBus API',
        description: 'Campus food ordering + intercity bus ticketing API',
        version: '0.1.0',
      },
      servers: [{ url: '/api/v1' }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  app.decorate('prisma', prisma);
  app.decorate('redis', redis);

  await app.register(registerHealthRoutes, { prefix: '/api/v1' });

  return app;
}
