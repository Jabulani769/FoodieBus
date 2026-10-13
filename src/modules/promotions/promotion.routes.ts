import type { FastifyInstance, FastifyRequest } from 'fastify';
import { promotionService } from './promotion.service.js';
import {
  createPromotionSchema,
  listActivePromotionsSchema,
  listMyPromotionsSchema,
  promotionParamsSchema,
  quotePromotionSchema,
} from './promotion.schema.js';
import { authenticate, authenticateOptional, authorize } from '../../shared/middleware/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAuditLog } from '../../shared/audit/audit.js';
import { prisma } from '../../shared/db/prisma.js';

function requireUser(request: FastifyRequest): NonNullable<typeof request.user> {
  if (!request.user) throw AppError.unauthorized();
  return request.user;
}

async function requireVendorId(userId: string): Promise<string> {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendor) throw AppError.notFound('Vendor profile not found');
  return vendor.id;
}

export async function registerPromotionRoutes(app: FastifyInstance): Promise<void> {
  // Public app feed — the promo card (dish + restaurant name/logo + validity + words).
  app.get(
    '/promotions/active',
    {
      preHandler: [authenticateOptional],
      schema: {
        tags: ['promotions'],
        summary: 'List live dish promotions for the app promo card',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
            vendorId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      // Expire lazily on read so the feed never shows stale promos even if the
      // background worker is delayed. Cheap: single indexed updateMany.
      await promotionService.expireDue().catch(() => undefined);
      const q = listActivePromotionsSchema.parse({ querystring: request.query ?? {} }).querystring;
      return reply.send(await promotionService.listActive(q.page, q.limit, q.vendorId));
    },
  );

  app.post(
    '/promotions/quote',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['promotions'],
        summary: 'Quote a dish promotion (flat per-day rate × days)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: { dishId: { type: 'string' }, days: { type: 'integer' } },
          required: ['dishId', 'days'],
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const vendorId = await requireVendorId(actor.id);
      const { dishId, days } = quotePromotionSchema.parse({ body: request.body }).body;
      return reply.send(await promotionService.quote(dishId, vendorId, days));
    },
  );

  app.post(
    '/promotions',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['promotions'],
        summary: 'Create a dish promotion (unpaid → pay with PayChangu)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            dishId: { type: 'string' },
            headline: { type: 'string' },
            description: { type: 'string' },
            imageUrl: { type: 'string' },
            days: { type: 'integer' },
            startsAt: { type: 'string' },
          },
          required: ['dishId', 'headline', 'days'],
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const vendorId = await requireVendorId(actor.id);
      const data = createPromotionSchema.parse({ body: request.body }).body;
      const result = await promotionService.create(vendorId, data);
      await writeAuditLog({
        actorId: actor.id,
        action: 'promotion.create',
        entity: 'promotion',
        entityId: result.id,
        details: { dishId: data.dishId, days: data.days, amountMWK: result.amountMWK },
        ipAddress: request.ip,
      });
      return reply.code(201).send(result);
    },
  );

  app.get(
    '/promotions/me',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['promotions'],
        summary: 'List my promotions',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const vendorId = await requireVendorId(actor.id);
      const { status } = listMyPromotionsSchema.parse({
        querystring: request.query ?? {},
      }).querystring;
      return reply.send(await promotionService.listMine(vendorId, status));
    },
  );

  app.post(
    '/promotions/:id/pay',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['promotions'],
        summary: 'Get PayChangu drop-in params for a promotion (no redirect — inline popup)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: { returnUrl: { type: 'string', format: 'uri' } },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const vendorId = await requireVendorId(actor.id);
      const { id } = promotionParamsSchema.parse(request).params;
      const body = (request.body ?? {}) as { returnUrl?: string };
      if (body.returnUrl !== undefined) {
        try {
          const u = new URL(body.returnUrl);
          if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad protocol');
        } catch {
          throw AppError.validation('returnUrl must be a valid http(s) URL');
        }
      }
      const result = await promotionService.inlineParams(id, vendorId, {
        returnUrl: body.returnUrl,
      });
      await writeAuditLog({
        actorId: actor.id,
        action: 'promotion.pay',
        entity: 'promotion',
        entityId: id,
        details: { txRef: result.txRef, amountMWK: result.amountMWK },
        ipAddress: request.ip,
      });
      return reply.code(201).send(result);
    },
  );

  app.post(
    '/promotions/:id/cancel',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['promotions'],
        summary: 'Cancel an unpaid or scheduled promotion',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const vendorId = await requireVendorId(actor.id);
      const { id } = promotionParamsSchema.parse(request).params;
      return reply.send(await promotionService.cancel(id, vendorId));
    },
  );

  // Manual re-verify (backup to webhook): vendor clicks "I've paid" and we
  // confirm with PayChangu, then flip PENDING_PAYMENT → ACTIVE/SCHEDULED.
  app.post(
    '/promotions/:id/verify',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['promotions'],
        summary: 'Re-verify a promotion payment with PayChangu',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const vendorId = await requireVendorId(actor.id);
      const { id } = promotionParamsSchema.parse(request).params;
      const promotion = await prisma.promotion.findUnique({ where: { id } });
      if (!promotion) throw AppError.notFound('Promotion not found');
      if (promotion.vendorId !== vendorId) throw AppError.forbidden('Not your promotion');
      if (!promotion.txRef) throw AppError.conflict('Promotion has not been paid yet');
      const { paychangu } = await import('../payments/paychangu.js');
      const verified = await paychangu.verify(promotion.txRef);
      if (verified.status === 'success' && verified.amount === Number(promotion.amountMWK)) {
        const confirmed = await promotionService.confirmByTxRef(promotion.txRef);
        await writeAuditLog({
          actorId: actor.id,
          action: 'promotion.verify',
          entity: 'promotion',
          entityId: id,
          details: { txRef: promotion.txRef, status: confirmed?.status },
          ipAddress: request.ip,
        });
        return reply.send(confirmed);
      }
      throw AppError.paymentFailed('PayChangu has not confirmed this payment yet');
    },
  );
}
