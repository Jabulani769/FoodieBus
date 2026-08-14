import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authService, createUser, ensureVendorProfile } from './auth.service.js';
import {
  createUserSchema,
  listUsersSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  updateUserSchema,
} from './auth.schema.js';
import { authenticate, authorize } from '../../shared/middleware/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAuditLog } from '../../shared/audit/audit.js';
import { prisma } from '../../shared/db/prisma.js';

function requireUser(request: FastifyRequest): NonNullable<typeof request.user> {
  if (!request.user) {
    throw AppError.unauthorized();
  }
  return request.user;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Login with email or phone + password',
        body: {
          type: 'object',
          properties: {
            identifier: { type: 'string' },
            password: { type: 'string' },
          },
          required: ['identifier', 'password'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { identifier, password } = loginSchema.parse({
        body: request.body,
      }).body;
      const tokens = await authService.login(identifier, password, {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
      return reply.send(tokens);
    },
  );

  app.post(
    '/auth/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: 'Rotate refresh token, get a new token pair',
        body: {
          type: 'object',
          properties: { refreshToken: { type: 'string' } },
          required: ['refreshToken'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = refreshSchema.parse({ body: request.body }).body;
      const tokens = await authService.refresh(refreshToken, {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
      return reply.send(tokens);
    },
  );

  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Revoke a refresh token',
        body: {
          type: 'object',
          properties: { refreshToken: { type: 'string' } },
          required: ['refreshToken'],
        },
        response: { 204: { type: 'null' } },
      },
    },
    async (request, reply) => {
      const { refreshToken } = logoutSchema.parse({ body: request.body }).body;
      await authService.logout(refreshToken);
      return reply.code(204).send();
    },
  );

  app.get(
    '/auth/me',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['auth'],
        summary: 'Get current user profile',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              fullName: { type: 'string' },
              role: { type: 'string' },
              isActive: { type: 'boolean' },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const user = requireUser(request);
      const userRecord = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });
      if (!userRecord) throw AppError.notFound('User not found');
      return reply.send(userRecord);
    },
  );

  // ---- Admin-only user management ----

  app.post(
    '/users',
    {
      preHandler: [authenticate, authorize('SUPER_ADMIN', 'ADMIN')],
      schema: {
        tags: ['admin'],
        summary: 'Create a user (super admin / admin only)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            phone: { type: 'string' },
            password: { type: 'string', minLength: 8 },
            fullName: { type: 'string' },
            role: {
              type: 'string',
              enum: ['SUPER_ADMIN', 'ADMIN', 'FINANCIAL', 'VENDOR', 'OPERATOR', 'STUDENT'],
            },
          },
          required: ['email', 'phone', 'password', 'fullName', 'role'],
        },
        response: { 201: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const data = createUserSchema.parse({ body: request.body }).body;
      const user = await createUser(data);
      await writeAuditLog({
        actorId: actor.id,
        action: 'user.create',
        entity: 'user',
        entityId: user.id,
        details: { role: data.role, email: data.email },
        ipAddress: request.ip,
      });
      return reply.code(201).send(user);
    },
  );

  app.get(
    '/users',
    {
      preHandler: [authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'FINANCIAL')],
      schema: {
        tags: ['admin'],
        summary: 'List users with pagination (admin / financial)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            role: {
              type: 'string',
              enum: ['SUPER_ADMIN', 'ADMIN', 'FINANCIAL', 'VENDOR', 'OPERATOR', 'STUDENT'],
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    phone: { type: 'string' },
                    fullName: { type: 'string' },
                    role: { type: 'string' },
                    isActive: { type: 'boolean' },
                    createdAt: { type: 'string' },
                  },
                },
              },
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = listUsersSchema.parse({ querystring: request.query }).querystring;
      const where = q.role ? { role: q.role } : {};
      const [items, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            phone: true,
            fullName: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          skip: (q.page - 1) * q.limit,
          take: q.limit,
        }),
        prisma.user.count({ where }),
      ]);
      return reply.send({ items, page: q.page, limit: q.limit, total });
    },
  );

  app.patch(
    '/users/:id',
    {
      preHandler: [authenticate, authorize('SUPER_ADMIN')],
      schema: {
        tags: ['admin'],
        summary: 'Update user role / status (super admin only)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            role: {
              type: 'string',
              enum: ['SUPER_ADMIN', 'ADMIN', 'FINANCIAL', 'VENDOR', 'OPERATOR', 'STUDENT'],
            },
            isActive: { type: 'boolean' },
            fullName: { type: 'string' },
          },
        },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = updateUserSchema.parse(request).params;
      const body = updateUserSchema.parse(request).body;
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) throw AppError.notFound('User not found');

      if (user.role === 'SUPER_ADMIN' && id !== actor.id && body.role !== undefined) {
        throw AppError.forbidden('Cannot change the role of another super admin');
      }

      await prisma.user.update({
        where: { id },
        data: body,
      });
      await ensureVendorProfile(id, user.fullName, body.role ?? user.role);
      await writeAuditLog({
        actorId: actor.id,
        action: 'user.update',
        entity: 'user',
        entityId: id,
        details: body,
        ipAddress: request.ip,
      });
      return reply.send({ id });
    },
  );
}
