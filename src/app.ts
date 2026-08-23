import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { logger } from './shared/logger/index.js';
import { errorHandler } from './shared/errors/index.js';
import { env } from './shared/config/index.js';
import { prisma } from './shared/db/prisma.js';
import { redis } from './shared/redis/index.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerFoodRoutes } from './modules/food/food.routes.js';
import { registerBusRoutes } from './modules/bus/bus.routes.js';
import { registerPaymentRoutes } from './modules/payments/payment.routes.js';
import { registerNotificationRoutes } from './modules/notifications/notification.routes.js';
import { registerAdminRoutes } from './modules/admin/admin.routes.js';
import { registerFinancialRoutes } from './modules/financial/financial.routes.js';
import { registerAnalyticsRoutes } from './modules/analytics/analytics.routes.js';
import { registerDeliveryRoutes } from './modules/delivery/delivery.routes.js';
import { registerUploadRoutes } from './modules/uploads/upload.routes.js';
import { registerRatingRoutes } from './modules/ratings/rating.routes.js';
import { registerCouponRoutes } from './modules/coupons/coupon.routes.js';
import { registerFavoriteRoutes } from './modules/favorites/favorite.routes.js';
import { registerMetricsRoutes } from './modules/metrics/metrics.routes.js';
import { registerEasyPayRoutes } from './modules/easypay/easypay.routes.js';
import { initMetricsHooks } from './shared/metrics/index.js';

export async function buildApp(
  options: FastifyServerOptions = {},
  runtime: { rateLimitEnabled?: boolean } = {},
) {
  const rateLimitEnabled = runtime.rateLimitEnabled ?? env.RATE_LIMIT_ENABLED === 'true';
  const app = Fastify({
    loggerInstance: options.loggerInstance ?? logger,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      if (typeof incoming === 'string' && incoming.length > 0) return incoming;
      return crypto.randomUUID();
    },
    ...options,
  });

  app.setErrorHandler(errorHandler);

  initMetricsHooks(app);

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(sensible);

  if (rateLimitEnabled) {
    await app.register(rateLimit, {
      max: 300,
      timeWindow: '1 minute',
      global: true,
      errorResponseBuilder: (_req, context) => {
        const err = new Error(
          `Too many requests. Please retry after ${context.after}.`,
        ) as Error & { statusCode?: number; code?: string };
        err.statusCode = context.statusCode;
        err.code = 'RATE_LIMITED';
        return err;
      },
    });
  }

  await app.register(multipart, {
    limits: { fileSize: env.STORAGE_MAX_SIZE_MB * 1024 * 1024 * 10 },
  });

  if (env.STORAGE_PROVIDER === 'mock') {
    const uploadRoot = resolve(env.STORAGE_UPLOAD_DIR);
    mkdirSync(uploadRoot, { recursive: true });
    await app.register(fastifyStatic, {
      root: uploadRoot,
      prefix: '/uploads/',
      decorateReply: false,
    });
  }

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'FoodieBus API',
        description: 'Campus food ordering + intercity bus ticketing API',
        version: '0.1.0',
      },
      servers: [{ url: '/api/v1' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  app.decorate('prisma', prisma);
  app.decorate('redis', redis);

  await app.register(registerHealthRoutes, { prefix: '/api/v1' });
  await app.register(registerAuthRoutes, { prefix: '/api/v1' });
  await app.register(registerFoodRoutes, { prefix: '/api/v1' });
  await app.register(registerBusRoutes, { prefix: '/api/v1' });
  await app.register(registerPaymentRoutes, { prefix: '/api/v1' });
  await app.register(registerNotificationRoutes, { prefix: '/api/v1' });
  await app.register(registerAdminRoutes, { prefix: '/api/v1' });
  await app.register(registerFinancialRoutes, { prefix: '/api/v1' });
  await app.register(registerAnalyticsRoutes, { prefix: '/api/v1' });
  await app.register(registerDeliveryRoutes, { prefix: '/api/v1' });
  await app.register(registerUploadRoutes, { prefix: '/api/v1' });
  await app.register(registerRatingRoutes, { prefix: '/api/v1' });
  await app.register(registerCouponRoutes, { prefix: '/api/v1' });
  await app.register(registerFavoriteRoutes, { prefix: '/api/v1' });
  await app.register(registerMetricsRoutes);

  // Easy Pay mobile contract adapter (root paths, snake_case) — see gap analysis.
  await app.register(registerEasyPayRoutes);

  return app;
}
