import type { FastifyInstance, FastifyRequest } from 'fastify';
import { adminService } from './admin.service.js';
import { authenticate, authorize } from '../../shared/middleware/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import {
  listAdminUsersSchema,
  listAuditLogsSchema,
  operatorIdParamsSchema,
  settingKeyParamsSchema,
  upsertSettingSchema,
  userIdParamsSchema,
  vendorIdParamsSchema,
} from './admin.schema.js';

function requireUser(request: FastifyRequest): NonNullable<typeof request.user> {
  if (!request.user) {
    throw AppError.unauthorized();
  }
  return request.user;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  const adminAuth = [authenticate, authorize('SUPER_ADMIN', 'ADMIN')];
  const superAdminAuth = [authenticate, authorize('SUPER_ADMIN')];

  app.get(
    '/admin/dashboard',
    {
      preHandler: adminAuth,
      schema: {
        tags: ['admin'],
        summary: 'Aggregate platform stats (admin)',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.send(await adminService.getDashboardStats());
    },
  );

  app.get(
    '/admin/users',
    {
      preHandler: [authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'FINANCIAL')],
      schema: {
        tags: ['admin'],
        summary: 'List users with role filter and search',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            role: { type: 'string' },
            search: { type: 'string' },
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
      const q = listAdminUsersSchema.parse({ querystring: request.query }).querystring;
      const result = await adminService.listUsers(q.page, q.limit, {
        role: q.role,
        search: q.search,
      });
      return reply.send(result);
    },
  );

  app.get(
    '/admin/users/:id',
    {
      preHandler: adminAuth,
      schema: {
        tags: ['admin'],
        summary: 'User detail with profiles and counts',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const { id } = userIdParamsSchema.parse(request).params;
      return reply.send(await adminService.getUserDetail(id));
    },
  );

  app.patch(
    '/admin/users/:id/status',
    {
      preHandler: adminAuth,
      schema: {
        tags: ['admin'],
        summary: 'Toggle a user active/inactive',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: {
          200: {
            type: 'object',
            properties: { id: { type: 'string' }, isActive: { type: 'boolean' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = userIdParamsSchema.parse(request).params;
      return reply.send(await adminService.toggleUserStatus(id, actor.id, actor.role));
    },
  );

  app.delete(
    '/admin/users/:id',
    {
      preHandler: superAdminAuth,
      schema: {
        tags: ['admin'],
        summary: 'Soft-delete a user (super admin only)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = userIdParamsSchema.parse(request).params;
      return reply.send(await adminService.softDeleteUser(id, actor.id, actor.role));
    },
  );

  app.patch(
    '/admin/vendors/:id/approve',
    {
      preHandler: adminAuth,
      schema: {
        tags: ['admin'],
        summary: 'Toggle vendor active/inactive',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: {
          200: {
            type: 'object',
            properties: { id: { type: 'string' }, isActive: { type: 'boolean' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = vendorIdParamsSchema.parse(request).params;
      return reply.send(await adminService.toggleVendorStatus(id, actor.id, actor.role));
    },
  );

  app.patch(
    '/admin/operators/:id/approve',
    {
      preHandler: adminAuth,
      schema: {
        tags: ['admin'],
        summary: 'Toggle operator active/inactive',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: {
          200: {
            type: 'object',
            properties: { id: { type: 'string' }, isActive: { type: 'boolean' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = operatorIdParamsSchema.parse(request).params;
      return reply.send(await adminService.toggleOperatorStatus(id, actor.id, actor.role));
    },
  );

  app.get(
    '/admin/audit-logs',
    {
      preHandler: adminAuth,
      schema: {
        tags: ['admin'],
        summary: 'Query audit logs with filters',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            actorId: { type: 'string' },
            action: { type: 'string' },
            entity: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: { type: 'array' },
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = listAuditLogsSchema.parse({ querystring: request.query }).querystring;
      const result = await adminService.listAuditLogs(q.page, q.limit, {
        actorId: q.actorId,
        action: q.action,
        entity: q.entity,
        from: q.from,
        to: q.to,
      });
      return reply.send(result);
    },
  );

  app.get(
    '/admin/settings',
    {
      preHandler: superAdminAuth,
      schema: {
        tags: ['admin'],
        summary: 'List all platform settings (super admin)',
        security: [{ bearerAuth: [] }],
        response: { 200: { type: 'array' } },
      },
    },
    async (_request, reply) => {
      return reply.send(await adminService.listSettings());
    },
  );

  app.get(
    '/admin/settings/:key',
    {
      preHandler: superAdminAuth,
      schema: {
        tags: ['admin'],
        summary: 'Get a platform setting by key (super admin)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { key: { type: 'string' } } },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const { key } = settingKeyParamsSchema.parse(request).params;
      return reply.send(await adminService.getSetting(key));
    },
  );

  app.put(
    '/admin/settings/:key',
    {
      preHandler: superAdminAuth,
      schema: {
        tags: ['admin'],
        summary: 'Create or update a platform setting (super admin)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { key: { type: 'string' } } },
        body: {
          type: 'object',
          properties: { value: {} },
          required: ['value'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { key } = settingKeyParamsSchema.parse(request).params;
      const { value } = upsertSettingSchema.parse({ body: request.body }).body;
      return reply.send(await adminService.upsertSetting(key, value, actor.id, actor.role));
    },
  );
}
