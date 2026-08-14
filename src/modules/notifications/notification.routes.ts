import type { FastifyInstance, FastifyRequest } from 'fastify';
import { notificationService } from './notification.service.js';
import { authenticate } from '../../shared/middleware/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import {
  listNotificationsSchema,
  notificationParamsSchema,
  updatePreferenceSchema,
} from './notification.schema.js';

function requireUser(request: FastifyRequest): NonNullable<typeof request.user> {
  if (!request.user) {
    throw AppError.unauthorized();
  }
  return request.user;
}

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/notifications/me',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['notifications'],
        summary: 'List my notifications (paginated)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
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
                    channel: { type: 'string' },
                    subject: { type: 'string' },
                    body: { type: 'string' },
                    status: { type: 'string' },
                    reference: { type: 'string' },
                    referenceType: { type: 'string' },
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
      const user = requireUser(request);
      const q = listNotificationsSchema.parse({ querystring: request.query }).querystring;
      const { items, total } = await notificationService.listByUser(user.id, q.page, q.limit);
      return reply.send({ items, page: q.page, limit: q.limit, total });
    },
  );

  app.patch(
    '/notifications/:id/read',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['notifications'],
        summary: 'Mark my notification as read',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const user = requireUser(request);
      const { id } = notificationParamsSchema.parse(request).params;
      const result = await notificationService.markRead(id, user.id);
      return reply.send(result);
    },
  );

  app.get(
    '/notifications/preferences',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['notifications'],
        summary: 'Get my notification channel preferences',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              sms: { type: 'boolean' },
              whatsapp: { type: 'boolean' },
              email: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const user = requireUser(request);
      return reply.send(await notificationService.getPreference(user.id));
    },
  );

  app.put(
    '/notifications/preferences',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['notifications'],
        summary: 'Update my notification channel preferences',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            sms: { type: 'boolean' },
            whatsapp: { type: 'boolean' },
            email: { type: 'boolean' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              sms: { type: 'boolean' },
              whatsapp: { type: 'boolean' },
              email: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const user = requireUser(request);
      const body = updatePreferenceSchema.parse({ body: request.body }).body;
      return reply.send(await notificationService.updatePreference(user.id, body));
    },
  );
}
