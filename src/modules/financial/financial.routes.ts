import type { FastifyInstance, FastifyRequest } from 'fastify';
import { financialService } from './financial.service.js';
import { authenticate, authorize } from '../../shared/middleware/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import {
  dateRangeQuerySchema,
  generateSettlementsSchema,
  listRefundsSchema,
  listSettlementsSchema,
  refundIdParamsSchema,
  rejectRefundSchema,
  requestRefundSchema,
  settlementIdParamsSchema,
} from './financial.schema.js';

function requireUser(request: FastifyRequest): NonNullable<typeof request.user> {
  if (!request.user) {
    throw AppError.unauthorized();
  }
  return request.user;
}

export async function registerFinancialRoutes(app: FastifyInstance): Promise<void> {
  const financialAuth = [authenticate, authorize('SUPER_ADMIN', 'FINANCIAL')];
  const superAdminAuth = [authenticate, authorize('SUPER_ADMIN')];

  // ---- Refund lifecycle ----

  app.post(
    '/financial/refunds',
    {
      preHandler: financialAuth,
      schema: {
        tags: ['financial'],
        summary: 'Request a refund for a paid payment (financial)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            paymentId: { type: 'string' },
            amount: { type: 'number' },
            reason: { type: 'string' },
          },
          required: ['paymentId', 'amount', 'reason'],
        },
        response: { 201: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { body } = requestRefundSchema.parse({ body: request.body });
      const refund = await financialService.requestRefund(
        body.paymentId,
        body.amount,
        body.reason,
        actor.id,
        actor.role,
      );
      return reply.code(201).send(refund);
    },
  );

  app.get(
    '/financial/refunds',
    {
      preHandler: financialAuth,
      schema: {
        tags: ['financial'],
        summary: 'List refund requests (financial)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            status: { type: 'string' },
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
      const q = listRefundsSchema.parse({ querystring: request.query }).querystring;
      const result = await financialService.listRefunds(q.page, q.limit, {
        status: q.status,
        from: q.from,
        to: q.to,
      });
      return reply.send(result);
    },
  );

  app.get(
    '/financial/refunds/:id',
    {
      preHandler: financialAuth,
      schema: {
        tags: ['financial'],
        summary: 'Refund detail (financial)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const { id } = refundIdParamsSchema.parse(request).params;
      return reply.send(await financialService.getRefundDetail(id));
    },
  );

  app.patch(
    '/financial/refunds/:id/approve',
    {
      preHandler: superAdminAuth,
      schema: {
        tags: ['financial'],
        summary: 'Approve a refund request (super admin)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = refundIdParamsSchema.parse(request).params;
      return reply.send(await financialService.approveRefund(id, actor.id, actor.role));
    },
  );

  app.patch(
    '/financial/refunds/:id/reject',
    {
      preHandler: superAdminAuth,
      schema: {
        tags: ['financial'],
        summary: 'Reject a refund request (super admin)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: { reason: { type: 'string' } },
          required: ['reason'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = refundIdParamsSchema.parse(request).params;
      const { body } = rejectRefundSchema.parse({ body: request.body });
      return reply.send(await financialService.rejectRefund(id, actor.id, body.reason, actor.role));
    },
  );

  app.post(
    '/financial/refunds/:id/process',
    {
      preHandler: superAdminAuth,
      schema: {
        tags: ['financial'],
        summary: 'Process an approved refund via PayChangu (super admin)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = refundIdParamsSchema.parse(request).params;
      return reply.send(await financialService.processRefund(id, actor.id, actor.role));
    },
  );

  // ---- Revenue reports ----

  app.get(
    '/financial/reports/revenue',
    {
      preHandler: financialAuth,
      schema: {
        tags: ['financial'],
        summary: 'Revenue summary with daily breakdown (financial)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = dateRangeQuerySchema.parse({ querystring: request.query }).querystring;
      return reply.send(await financialService.revenueReport(q.from, q.to));
    },
  );

  app.get(
    '/financial/reports/revenue/by-route',
    {
      preHandler: financialAuth,
      schema: {
        tags: ['financial'],
        summary: 'Revenue grouped by route (financial)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = dateRangeQuerySchema.parse({ querystring: request.query }).querystring;
      return reply.send(await financialService.revenueByRoute(q.from, q.to));
    },
  );

  app.get(
    '/financial/reports/revenue/by-operator',
    {
      preHandler: financialAuth,
      schema: {
        tags: ['financial'],
        summary: 'Revenue grouped by operator (financial)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = dateRangeQuerySchema.parse({ querystring: request.query }).querystring;
      return reply.send(await financialService.revenueByOperator(q.from, q.to));
    },
  );

  app.get(
    '/financial/reports/payments/export',
    {
      preHandler: financialAuth,
      schema: {
        tags: ['financial'],
        summary: 'Export paid payments as CSV (financial)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'string' } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = dateRangeQuerySchema.parse({ querystring: request.query }).querystring;
      const csv = await financialService.exportPaymentsCsv(q.from, q.to);
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="payments.csv"')
        .send(csv);
    },
  );

  // ---- Settlements ----

  app.get(
    '/financial/settlements',
    {
      preHandler: financialAuth,
      schema: {
        tags: ['financial'],
        summary: 'List settlements (financial)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            operatorId: { type: 'string' },
            vendorId: { type: 'string' },
            period: { type: 'string' },
            status: { type: 'string' },
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
      const q = listSettlementsSchema.parse({ querystring: request.query }).querystring;
      const result = await financialService.listSettlements(q.page, q.limit, {
        operatorId: q.operatorId,
        vendorId: q.vendorId,
        period: q.period,
        status: q.status,
      });
      return reply.send(result);
    },
  );

  app.post(
    '/financial/settlements/generate',
    {
      preHandler: superAdminAuth,
      schema: {
        tags: ['financial'],
        summary: 'Generate settlements for a period (super admin)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: { period: { type: 'string' } },
          required: ['period'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { body } = generateSettlementsSchema.parse({ body: request.body });
      return reply.send(
        await financialService.generateSettlements(body.period, actor.id, actor.role),
      );
    },
  );

  app.patch(
    '/financial/settlements/:id/pay',
    {
      preHandler: superAdminAuth,
      schema: {
        tags: ['financial'],
        summary: 'Mark a settlement as paid (super admin)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = settlementIdParamsSchema.parse(request).params;
      return reply.send(await financialService.markSettlementPaid(id, actor.id, actor.role));
    },
  );
}
