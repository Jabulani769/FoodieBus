import type { FastifyInstance, FastifyRequest } from 'fastify';
import { favoriteService } from './favorite.service.js';
import { authenticate } from '../../shared/middleware/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import { addFavoriteSchema, listFavoritesSchema } from './favorite.schema.js';

function requireUser(request: FastifyRequest): NonNullable<typeof request.user> {
  if (!request.user) {
    throw AppError.unauthorized();
  }
  return request.user;
}

export async function registerFavoriteRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/favorites',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['favorites'],
        summary: 'Add a favorite dish or vendor',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            dishId: { type: 'string' },
            vendorId: { type: 'string' },
          },
        },
        response: { 201: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const data = addFavoriteSchema.parse({ body: request.body }).body;
      const favorite = await favoriteService.addFavorite(actor.id, data);
      return reply.code(201).send(favorite);
    },
  );

  app.get(
    '/favorites',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['favorites'],
        summary: 'List the authenticated user favorites',
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
              items: { type: 'array', items: { type: 'object', additionalProperties: true } },
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const actor = requireUser(request);
      const q = listFavoritesSchema.parse({ querystring: request.query ?? {} }).querystring;
      const result = await favoriteService.listFavorites(actor.id, q.page, q.limit);
      return reply.send(result);
    },
  );

  app.get(
    '/favorites/top',
    {
      schema: {
        tags: ['favorites'],
        summary: 'Most-favorited dishes and vendors (public)',
        response: {
          200: {
            type: 'object',
            properties: {
              topDishes: { type: 'array', items: { type: 'object', additionalProperties: true } },
              topVendors: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.send(await favoriteService.topFavorites());
    },
  );

  app.delete(
    '/favorites/:id',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['favorites'],
        summary: 'Remove a favorite',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 204: { type: 'null' } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = request.params as { id: string };
      await favoriteService.removeFavorite(id, actor.id);
      return reply.code(204).send();
    },
  );
}
