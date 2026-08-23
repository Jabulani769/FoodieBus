import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { authenticate } from '../../shared/middleware/index.js';
import { env } from '../../shared/config/env.js';
import { authService } from '../auth/auth.service.js';
import { easyPayService } from './easypay.service.js';
import {
  bookBusSchema,
  foodOrderSchema,
  profileUpdateSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from './easypay.schema.js';

interface AuthUser {
  id: string;
  role: string;
  email: string;
  phone: string;
  fullName?: string;
}

function requireUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw AppError.unauthorized();
  return request.user as unknown as AuthUser;
}

function formatError(err: unknown): { statusCode: number; body: Record<string, unknown> } {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      body: { status: 'error', error_code: err.code.toUpperCase(), message: err.message },
    };
  }
  if (err instanceof z.ZodError) {
    return {
      statusCode: 400,
      body: {
        status: 'error',
        error_code: 'VALIDATION_ERROR',
        message: err.issues[0]?.message ?? 'Validation error',
      },
    };
  }
  const fe = err as { statusCode?: number; message?: string };
  const statusCode = typeof fe.statusCode === 'number' && fe.statusCode < 500 ? fe.statusCode : 500;
  return {
    statusCode,
    body: {
      status: 'error',
      error_code:
        statusCode === 401 ? 'UNAUTHORIZED' : statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: statusCode >= 500 ? 'Internal server error' : (fe.message ?? 'Request failed'),
    },
  };
}

export async function registerEasyPayRoutes(app: FastifyInstance): Promise<void> {
  // Spec-compliant error envelope for this contract surface.
  app.setErrorHandler((err, _request, reply) => {
    const { statusCode, body } = formatError(err);
    reply.status(statusCode).send(body);
  });

  // ---- Auth (phone OTP) ----
  app.post('/auth/request-otp', async (request, reply) => {
    const { body } = requestOtpSchema.parse(request);
    await authService.requestLoginOtp(body.phone);
    return reply.send({
      status: 'success',
      message: 'OTP sent successfully',
      expires_in_seconds: env.OTP_TTL_MINUTES * 60,
    });
  });

  app.post('/auth/verify-otp', async (request, reply) => {
    const { body } = verifyOtpSchema.parse(request);
    const result = await authService.verifyLoginOtp(body.phone, body.code);
    return reply.send(result);
  });

  // ---- Kitchens (vendors) ----
  app.get('/kitchens', async () => {
    return easyPayService.listKitchens();
  });

  app.get<{ Params: { id: string } }>('/kitchens/:id/menu', async (request, reply) => {
    const items = await easyPayService.getKitchenMenu(request.params.id);
    return reply.send(items);
  });

  // ---- Bus ----
  app.get<{ Querystring: { from?: string; to?: string; date?: string } }>(
    '/bus/search',
    async (request, reply) => {
      const { from, to, date } = request.query;
      const results = await easyPayService.searchBus(from, to, date);
      return reply.send(results);
    },
  );

  app.post('/bus/book', { preHandler: [authenticate] }, async (request, reply) => {
    const user = requireUser(request);
    const { body } = bookBusSchema.parse(request);
    const ticket = await easyPayService.bookBus(user, body);
    return reply.code(201).send(ticket);
  });

  // ---- Food orders ----
  app.post('/orders/food', { preHandler: [authenticate] }, async (request, reply) => {
    const user = requireUser(request);
    const { body } = foodOrderSchema.parse(request);
    const order = await easyPayService.placeFoodOrder(user, body);
    return reply.code(201).send(order);
  });

  // ---- User ----
  app.get('/user/profile', { preHandler: [authenticate] }, async (request, reply) => {
    const user = requireUser(request);
    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, phone: true, fullName: true, role: true, isActive: true },
    });
    if (!record) throw AppError.notFound('User not found');
    return reply.send({
      id: record.id,
      name: record.fullName,
      email: record.email,
      phone: record.phone,
      profile_image: null,
      role: record.role,
      is_active: record.isActive,
    });
  });

  app.put('/user/profile/update', { preHandler: [authenticate] }, async (request, reply) => {
    const user = requireUser(request);
    const { body } = profileUpdateSchema.parse(request);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(body.name !== undefined ? { fullName: body.name } : {}),
        ...(body.email !== undefined ? { email: body.email.toLowerCase() } : {}),
      },
    });
    return reply.send({ status: 'success', message: 'Profile updated successfully' });
  });

  app.get<{ Querystring: { page?: string; limit?: string } }>(
    '/user/notifications',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = requireUser(request);
      const page = Number(request.query.page ?? 1) || 1;
      const limit = Math.min(Number(request.query.limit ?? 20) || 20, 100);
      const result = await easyPayService.listNotifications(user.id, page, limit);
      return reply.send(result.items);
    },
  );
}
