import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ratingService } from './rating.service.js';
import { authenticate, authorize } from '../../shared/middleware/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAuditLog } from '../../shared/audit/audit.js';
import {
  createRatingSchema,
  listRatingsSchema,
  ratingParamsSchema,
  updateRatingSchema,
} from './rating.schema.js';

function requireUser(request: FastifyRequest): NonNullable<typeof request.user> {
  if (!request.user) {
    throw AppError.unauthorized();
  }
  return request.user;
}

export async function registerRatingRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/ratings',
    {
      preHandler: [authenticate, authorize('STUDENT')],
      schema: {
        tags: ['ratings'],
        summary: 'Rate a trip, dish, operator, or vendor (one rating per user per entity)',
        description:
          'Students can rate TRIP / OPERATOR after a confirmed booking, and DISH / VENDOR ' +
          'after a delivered food order. One rating per (user, entity) — duplicates return 409.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            entityType: { type: 'string', enum: ['TRIP', 'DISH', 'OPERATOR', 'VENDOR'] },
            entityId: { type: 'string' },
            score: { type: 'integer', minimum: 1, maximum: 5 },
            comment: { type: 'string' },
          },
          required: ['entityType', 'entityId', 'score'],
        },
        response: { 201: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const data = createRatingSchema.parse({ body: request.body }).body;
      const rating = await ratingService.createRating(actor.id, data);
      await writeAuditLog({
        actorId: actor.id,
        action: 'rating.create',
        entity: 'rating',
        entityId: rating.id,
        details: { entityType: data.entityType, entityId: data.entityId, score: data.score },
        ipAddress: request.ip,
      });
      return reply.code(201).send(rating);
    },
  );

  app.get(
    '/ratings',
    {
      schema: {
        tags: ['ratings'],
        summary: 'List ratings, optionally filtered by entity',
        querystring: {
          type: 'object',
          properties: {
            entityType: { type: 'string', enum: ['TRIP', 'DISH', 'OPERATOR', 'VENDOR'] },
            entityId: { type: 'string' },
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
                    entityType: { type: 'string' },
                    entityId: { type: 'string' },
                    score: { type: 'integer' },
                    comment: { type: 'string' },
                    createdAt: { type: 'string' },
                    user: {
                      type: 'object',
                      properties: { id: { type: 'string' }, fullName: { type: 'string' } },
                    },
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
    async (request, reply) => {
      const q = listRatingsSchema.parse({ querystring: request.query ?? {} }).querystring;
      const result = await ratingService.listRatings(q.entityType, q.entityId, q.page, q.limit);
      return reply.send(result);
    },
  );

  app.patch(
    '/ratings/:id',
    {
      preHandler: [authenticate, authorize('STUDENT')],
      schema: {
        tags: ['ratings'],
        summary: 'Update your own rating',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            score: { type: 'integer', minimum: 1, maximum: 5 },
            comment: { type: 'string' },
          },
        },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const parsed = updateRatingSchema.parse(request);
      const rating = await ratingService.updateOwnRating(parsed.params.id, actor.id, parsed.body);
      await writeAuditLog({
        actorId: actor.id,
        action: 'rating.update',
        entity: 'rating',
        entityId: rating.id,
        details: { score: parsed.body.score, comment: parsed.body.comment },
        ipAddress: request.ip,
      });
      return reply.send(rating);
    },
  );

  app.delete(
    '/ratings/:id',
    {
      preHandler: [authenticate, authorize('STUDENT')],
      schema: {
        tags: ['ratings'],
        summary: 'Delete your own rating',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 204: { type: 'null' } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = ratingParamsSchema.parse(request).params;
      await ratingService.deleteOwnRating(id, actor.id);
      await writeAuditLog({
        actorId: actor.id,
        action: 'rating.delete',
        entity: 'rating',
        entityId: id,
        ipAddress: request.ip,
      });
      return reply.code(204).send();
    },
  );
}
