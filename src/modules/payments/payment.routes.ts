import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { paymentService } from './payment.service.js';
import { createPaymentSchema, paymentParamsSchema } from './payment.schema.js';
import { authenticate } from '../../shared/middleware/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAuditLog } from '../../shared/audit/audit.js';
import { prisma } from '../../shared/db/prisma.js';
import { env } from '../../shared/config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';

function requireUser(request: FastifyRequest): NonNullable<typeof request.user> {
  if (!request.user) {
    throw AppError.unauthorized();
  }
  return request.user;
}

function verifyWebhookSignature(
  rawBody: string | undefined,
  signature: string | undefined,
): boolean {
  if (!rawBody || !signature || !env.PAYCHANGU_WEBHOOK_SECRET) return false;
  const expected = createHmac('sha256', env.PAYCHANGU_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function extractTxRef(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const p = payload as Record<string, unknown>;
  if (typeof p.tx_ref === 'string') return p.tx_ref;
  if (typeof p.txRef === 'string') return p.txRef;
  const inner = p.data;
  if (inner && typeof inner === 'object') {
    const d = inner as Record<string, unknown>;
    if (typeof d.tx_ref === 'string') return d.tx_ref;
    if (typeof d.txRef === 'string') return d.txRef;
  }
  return undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export async function registerPaymentRoutes(app: FastifyInstance): Promise<void> {
  // Capture the raw body so webhook HMAC signatures can be verified.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      (req as FastifyRequest & { rawBody?: string }).rawBody = body as string;
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.post(
    '/payments',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['payments'],
        summary: 'Initiate a payment for a pending booking',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: { bookingId: { type: 'string' } },
          required: ['bookingId'],
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              txRef: { type: 'string' },
              checkoutUrl: { type: 'string' },
              amount: { type: 'string' },
              currency: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { bookingId } = createPaymentSchema.parse({ body: request.body }).body;
      const result = await paymentService.createPayment(actor.id, bookingId);
      await writeAuditLog({
        actorId: actor.id,
        action: 'payment.initiate',
        entity: 'payment',
        entityId: result.id,
        details: { bookingId, txRef: result.txRef, amount: result.amount },
        ipAddress: request.ip,
      });
      return reply.code(201).send(result);
    },
  );

  app.get(
    '/payments/me',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['payments'],
        summary: 'List the authenticated user payments',
        security: [{ bearerAuth: [] }],
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
                    txRef: { type: 'string' },
                    amount: { type: 'string' },
                    currency: { type: 'string' },
                    status: { type: 'string' },
                    createdAt: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const result = await paymentService.listByPassenger(actor.id);
      return reply.send(result);
    },
  );

  app.get(
    '/payments/:id',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['payments'],
        summary: 'Get a payment by id (owner or staff)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              txRef: { type: 'string' },
              amount: { type: 'string' },
              currency: { type: 'string' },
              status: { type: 'string' },
              checkoutUrl: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = paymentParamsSchema.parse(request).params;
      const payment = await paymentService.getPaymentById(id);
      await paymentService.assertCanView(
        payment as { booking: { passengerId: string } },
        actor.id,
        actor.role as 'FINANCIAL' | 'ADMIN' | 'SUPER_ADMIN' | 'VENDOR' | 'OPERATOR' | 'STUDENT',
      );
      return reply.send(payment);
    },
  );

  app.post(
    '/payments/:id/verify',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['payments'],
        summary: 'Re-verify a payment status with PayChangu (backup to webhook)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              txRef: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = paymentParamsSchema.parse(request).params;
      const payment = await paymentService.getPaymentById(id);
      await paymentService.assertCanView(
        payment as { booking: { passengerId: string } },
        actor.id,
        actor.role as 'FINANCIAL' | 'ADMIN' | 'SUPER_ADMIN' | 'VENDOR' | 'OPERATOR' | 'STUDENT',
      );
      const p = payment as { txRef: string };
      const result = await paymentService.verifyAndConfirm(p.txRef);
      await writeAuditLog({
        actorId: actor.id,
        action: 'payment.verify',
        entity: 'payment',
        entityId: id,
        details: { txRef: p.txRef },
        ipAddress: request.ip,
      });
      return reply.send(result);
    },
  );

  app.get(
    '/payments/:id/receipt',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['payments'],
        summary: 'Download a PDF receipt for a paid payment',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = paymentParamsSchema.parse(request).params;
      const { buffer, filename } = await paymentService.generateReceipt(id, {
        id: actor.id,
        role: actor.role as
          'FINANCIAL' | 'ADMIN' | 'SUPER_ADMIN' | 'VENDOR' | 'OPERATOR' | 'STUDENT',
      });
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(buffer);
    },
  );

  app.post(
    '/webhooks/paychangu',
    {
      schema: {
        tags: ['payments'],
        summary: 'PayChangu webhook (HMAC-verified)',
        response: {
          200: {
            type: 'object',
            properties: { received: { type: 'boolean' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody;
      const signature = request.headers['signature'] as string | undefined;
      if (!verifyWebhookSignature(rawBody, signature)) {
        throw AppError.unauthorized('Invalid webhook signature');
      }

      const txRef = extractTxRef(request.body);
      if (!txRef) {
        throw AppError.validation('Webhook payload is missing tx_ref');
      }

      const payload = request.body as Record<string, unknown>;
      const event = typeof payload.event === 'string' ? payload.event : 'checkout.payment';
      const status = typeof payload.status === 'string' ? payload.status : 'unknown';

      // Idempotency: a repeated webhook for the same (txRef, event) is skipped so it
      // can never double-confirm or double-refund. Also keeps an audit trail of raw
      // deliveries.
      let alreadyHandled = false;
      try {
        await prisma.webhookEvent.create({
          data: {
            txRef,
            event,
            status,
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          alreadyHandled = true;
        } else {
          throw err;
        }
      }

      if (!alreadyHandled) {
        await paymentService.verifyAndConfirm(txRef);
      }

      const payment = await prisma.payment.findUnique({
        where: { txRef },
        select: { id: true, bookingId: true, status: true },
      });
      if (payment) {
        await writeAuditLog({
          action: 'payment.webhook',
          entity: 'payment',
          entityId: payment.id,
          details: {
            txRef,
            bookingId: payment.bookingId,
            status: payment.status,
            deduplicated: alreadyHandled,
          },
          ipAddress: request.ip,
        });
      }

      return reply.send({ received: true });
    },
  );
}
