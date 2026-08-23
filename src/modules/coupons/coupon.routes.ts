import type { FastifyInstance, FastifyRequest } from 'fastify';
import { couponService } from './coupon.service.js';
import { authenticate, authorize } from '../../shared/middleware/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAuditLog } from '../../shared/audit/audit.js';
import {
  couponParamsSchema,
  createCouponSchema,
  listCouponsSchema,
  updateCouponSchema,
  validateCouponSchema,
} from './coupon.schema.js';

function requireUser(request: FastifyRequest): NonNullable<typeof request.user> {
  if (!request.user) {
    throw AppError.unauthorized();
  }
  return request.user;
}

export async function registerCouponRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/coupons',
    {
      preHandler: [authenticate, authorize('SUPER_ADMIN')],
      schema: {
        tags: ['coupons'],
        summary: 'Create a promotional coupon',
        description:
          'Super admin only. Coupon codes are uppercased and unique. PERCENT value is capped at 100. ' +
          'maxUses of 0 means unlimited.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            code: { type: 'string', minLength: 1, maxLength: 50 },
            type: { type: 'string', enum: ['PERCENT', 'FIXED'] },
            value: { type: 'number' },
            maxUses: { type: 'integer', minimum: 0, default: 0 },
            perUserUses: { type: 'integer', minimum: 1, default: 1 },
            validFrom: { type: 'string', format: 'date-time' },
            validTo: { type: 'string', format: 'date-time' },
            applicableTo: { type: 'string', enum: ['TRIP', 'FOOD', 'BOTH'], default: 'BOTH' },
            minSpend: { type: 'number' },
            isActive: { type: 'boolean', default: true },
          },
          required: ['code', 'type', 'value', 'validFrom', 'validTo'],
        },
        response: { 201: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const data = createCouponSchema.parse({ body: request.body }).body;
      const coupon = await couponService.createCoupon(data);
      await writeAuditLog({
        actorId: actor.id,
        action: 'coupon.create',
        entity: 'coupon',
        entityId: coupon.id,
        details: { code: data.code, type: data.type, value: data.value },
        ipAddress: request.ip,
      });
      return reply.code(201).send(coupon);
    },
  );

  app.get(
    '/coupons',
    {
      preHandler: [authenticate, authorize('SUPER_ADMIN')],
      schema: {
        tags: ['coupons'],
        summary: 'List coupons',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            isActive: { type: 'string', enum: ['true', 'false'] },
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
                    code: { type: 'string' },
                    type: { type: 'string' },
                    value: { type: 'number' },
                    maxUses: { type: 'integer' },
                    perUserUses: { type: 'integer' },
                    validFrom: { type: 'string' },
                    validTo: { type: 'string' },
                    applicableTo: { type: 'string' },
                    minSpend: { type: ['number', 'null'] },
                    isActive: { type: 'boolean' },
                    createdAt: { type: 'string' },
                    _count: {
                      type: 'object',
                      properties: { usages: { type: 'integer' } },
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
      const q = listCouponsSchema.parse({ querystring: request.query ?? {} }).querystring;
      const result = await couponService.listCoupons(
        q.page,
        q.limit,
        q.isActive === undefined ? undefined : q.isActive === 'true',
      );
      return reply.send(result);
    },
  );

  app.get(
    '/coupons/:code/validate',
    {
      schema: {
        tags: ['coupons'],
        summary: 'Validate a coupon by code (public)',
        description:
          'Public. Optionally pass applicableTo and amount to check applicability and compute the ' +
          'discount. Returns 404 for unknown codes, 409 for invalid/expired/used-up coupons.',
        params: { type: 'object', properties: { code: { type: 'string' } } },
        querystring: {
          type: 'object',
          properties: {
            applicableTo: { type: 'string', enum: ['TRIP', 'FOOD', 'BOTH'] },
            amount: { type: 'number' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              couponId: { type: 'string' },
              code: { type: 'string' },
              type: { type: 'string' },
              discountAmount: { type: 'number' },
              finalAmount: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = validateCouponSchema.parse({
        params: request.params,
        querystring: request.query ?? {},
      });
      const result = await couponService.validateCoupon(parsed.params.code, parsed.querystring);
      return reply.send(result);
    },
  );

  app.patch(
    '/coupons/:id',
    {
      preHandler: [authenticate, authorize('SUPER_ADMIN')],
      schema: {
        tags: ['coupons'],
        summary: 'Update a coupon',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['PERCENT', 'FIXED'] },
            value: { type: 'number' },
            maxUses: { type: 'integer', minimum: 0 },
            perUserUses: { type: 'integer', minimum: 1 },
            validFrom: { type: 'string', format: 'date-time' },
            validTo: { type: 'string', format: 'date-time' },
            applicableTo: { type: 'string', enum: ['TRIP', 'FOOD', 'BOTH'] },
            minSpend: { type: ['number', 'null'] },
            isActive: { type: 'boolean' },
          },
        },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const parsed = updateCouponSchema.parse(request);
      const coupon = await couponService.updateCoupon(parsed.params.id, parsed.body);
      await writeAuditLog({
        actorId: actor.id,
        action: 'coupon.update',
        entity: 'coupon',
        entityId: coupon.id,
        ipAddress: request.ip,
      });
      return reply.send(coupon);
    },
  );

  app.delete(
    '/coupons/:id',
    {
      preHandler: [authenticate, authorize('SUPER_ADMIN')],
      schema: {
        tags: ['coupons'],
        summary: 'Delete a coupon',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 204: { type: 'null' } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = couponParamsSchema.parse(request).params;
      await couponService.deleteCoupon(id);
      await writeAuditLog({
        actorId: actor.id,
        action: 'coupon.delete',
        entity: 'coupon',
        entityId: id,
        ipAddress: request.ip,
      });
      return reply.code(204).send();
    },
  );
}
