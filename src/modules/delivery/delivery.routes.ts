import type { FastifyInstance, FastifyRequest } from 'fastify';
import { deliveryService } from './delivery.service.js';
import { authenticate, authorize } from '../../shared/middleware/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAuditLog } from '../../shared/audit/audit.js';
import {
  foodOrderParamsSchema,
  listVendorOrdersSchema,
  placeFoodOrderSchema,
  updateFoodOrderStatusSchema,
  vendorParamsSchema,
} from './delivery.schema.js';

function requireUser(request: FastifyRequest): NonNullable<typeof request.user> {
  if (!request.user) {
    throw AppError.unauthorized();
  }
  return request.user;
}

export async function registerDeliveryRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/food-orders',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['delivery'],
        summary: 'Place a food order for a confirmed booking',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            bookingId: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: { dishId: { type: 'string' }, quantity: { type: 'integer' } },
                required: ['dishId', 'quantity'],
              },
            },
            note: { type: 'string' },
          },
          required: ['bookingId', 'items'],
        },
        response: { 201: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { body } = placeFoodOrderSchema.parse({ body: request.body });
      const order = await deliveryService.placeFoodOrder(actor.id, body);
      await writeAuditLog({
        actorId: actor.id,
        action: 'food_order.place',
        entity: 'food_order',
        entityId: (order as { id: string }).id,
        ipAddress: request.ip,
      });
      return reply.code(201).send(order);
    },
  );

  app.get(
    '/food-orders/me',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['delivery'],
        summary: 'List own food orders',
        security: [{ bearerAuth: [] }],
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      return reply.send(await deliveryService.listByPassenger(actor.id));
    },
  );

  app.get(
    '/food-orders/:id',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['delivery'],
        summary: 'Get a food order detail',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = foodOrderParamsSchema.parse(request).params;
      return reply.send(await deliveryService.getFoodOrderDetail(id, actor.id, actor.role));
    },
  );

  app.patch(
    '/food-orders/:id/status',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['delivery'],
        summary: 'Update a food order status (vendor only)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['PLACED', 'PREPARING', 'READY', 'DELIVERED_TO_BUS', 'CANCELLED'],
            },
          },
          required: ['status'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const parsed = updateFoodOrderStatusSchema.parse(request);
      return reply.send(
        await deliveryService.updateFoodOrderStatus(parsed.params.id, parsed.body.status, actor.id),
      );
    },
  );

  app.get(
    '/vendors/:vendorId/orders',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['delivery'],
        summary: 'List food orders for a vendor',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { vendorId: { type: 'string' } } },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            status: { type: 'string' },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const q = listVendorOrdersSchema.parse({ querystring: request.query }).querystring;
      const { vendorId } = vendorParamsSchema.parse(request).params;
      const vendor = await import('../../shared/db/prisma.js').then((m) =>
        m.prisma.vendorProfile.findUnique({ where: { id: vendorId }, select: { userId: true } }),
      );
      if (!vendor || vendor.userId !== actor.id) {
        throw AppError.forbidden('You can only view your own vendor orders');
      }
      return reply.send(
        await deliveryService.listVendorOrders(actor.id, {
          status: q.status,
          page: q.page,
          limit: q.limit,
        }),
      );
    },
  );
}
