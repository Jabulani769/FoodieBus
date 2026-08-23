import type { FastifyInstance, FastifyRequest } from 'fastify';
import { analyticsService } from './analytics.service.js';
import { authenticate, authorize } from '../../shared/middleware/index.js';
import {
  dateRangeQuerySchema,
  growthQuerySchema,
  topPassengersQuerySchema,
  tripUtilizationQuerySchema,
} from './analytics.schema.js';

export async function registerAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  const analyticsAuth = [authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'FINANCIAL')];

  // ---- Platform overview ----

  app.get(
    '/analytics/platform/overview',
    {
      preHandler: analyticsAuth,
      schema: {
        tags: ['analytics'],
        summary: 'KPI snapshot with previous-period comparison',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = dateRangeQuerySchema.parse({ querystring: request.query }).querystring;
      return reply.send(await analyticsService.platformOverview(q.from, q.to));
    },
  );

  app.get(
    '/analytics/platform/growth',
    {
      preHandler: analyticsAuth,
      schema: {
        tags: ['analytics'],
        summary: 'Time-series of users, bookings, revenue',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            granularity: { type: 'string', enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = growthQuerySchema.parse({ querystring: request.query }).querystring;
      return reply.send(await analyticsService.platformGrowth(q.from, q.to, q.granularity));
    },
  );

  // ---- Seat utilization ----

  app.get(
    '/analytics/utilization/trips',
    {
      preHandler: analyticsAuth,
      schema: {
        tags: ['analytics'],
        summary: 'Per-trip seat utilization',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            routeId: { type: 'string' },
            operatorId: { type: 'string' },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = tripUtilizationQuerySchema.parse({ querystring: request.query }).querystring;
      return reply.send(
        await analyticsService.tripUtilization(q.from, q.to, {
          routeId: q.routeId,
          operatorId: q.operatorId,
        }),
      );
    },
  );

  app.get(
    '/analytics/utilization/routes',
    {
      preHandler: analyticsAuth,
      schema: {
        tags: ['analytics'],
        summary: 'Seat utilization aggregated by route',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = dateRangeQuerySchema.parse({ querystring: request.query }).querystring;
      return reply.send(await analyticsService.utilizationByDimension(q.from, q.to, 'route'));
    },
  );

  app.get(
    '/analytics/utilization/operators',
    {
      preHandler: analyticsAuth,
      schema: {
        tags: ['analytics'],
        summary: 'Seat utilization aggregated by operator',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = dateRangeQuerySchema.parse({ querystring: request.query }).querystring;
      return reply.send(await analyticsService.utilizationByDimension(q.from, q.to, 'operator'));
    },
  );

  // ---- Conversion funnels ----

  app.get(
    '/analytics/funnel/bookings',
    {
      preHandler: analyticsAuth,
      schema: {
        tags: ['analytics'],
        summary: 'Booking status funnel with conversion rates',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = dateRangeQuerySchema.parse({ querystring: request.query }).querystring;
      return reply.send(await analyticsService.bookingFunnel(q.from, q.to));
    },
  );

  app.get(
    '/analytics/funnel/payments',
    {
      preHandler: analyticsAuth,
      schema: {
        tags: ['analytics'],
        summary: 'Payment status funnel with success/failure rates',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = dateRangeQuerySchema.parse({ querystring: request.query }).querystring;
      return reply.send(await analyticsService.paymentFunnel(q.from, q.to));
    },
  );

  // ---- Passenger analytics ----

  app.get(
    '/analytics/passengers/overview',
    {
      preHandler: analyticsAuth,
      schema: {
        tags: ['analytics'],
        summary: 'Passenger insights: unique, repeat rate, top route',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = dateRangeQuerySchema.parse({ querystring: request.query }).querystring;
      return reply.send(await analyticsService.passengerOverview(q.from, q.to));
    },
  );

  app.get(
    '/analytics/passengers/top',
    {
      preHandler: analyticsAuth,
      schema: {
        tags: ['analytics'],
        summary: 'Top passengers by bookings or spend',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            sortBy: { type: 'string', enum: ['bookings', 'spend'], default: 'bookings' },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = topPassengersQuerySchema.parse({ querystring: request.query }).querystring;
      return reply.send(await analyticsService.topPassengers(q.from, q.to, q.sortBy, q.limit));
    },
  );

  // ---- Notification analytics ----

  app.get(
    '/analytics/notifications/delivery-rate',
    {
      preHandler: analyticsAuth,
      schema: {
        tags: ['analytics'],
        summary: 'Notification delivery rate by channel',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = dateRangeQuerySchema.parse({ querystring: request.query }).querystring;
      return reply.send(await analyticsService.notificationDeliveryRate(q.from, q.to));
    },
  );

  app.get(
    '/analytics/notifications/failures',
    {
      preHandler: analyticsAuth,
      schema: {
        tags: ['analytics'],
        summary: 'Notification failure reasons',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = dateRangeQuerySchema.parse({ querystring: request.query }).querystring;
      return reply.send(await analyticsService.notificationFailures(q.from, q.to));
    },
  );

  // ---- Refund analytics ----

  app.get(
    '/analytics/refunds/summary',
    {
      preHandler: analyticsAuth,
      schema: {
        tags: ['analytics'],
        summary: 'Refund volume, approval and refund rates',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['from', 'to'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const q = dateRangeQuerySchema.parse({ querystring: request.query }).querystring;
      return reply.send(await analyticsService.refundSummary(q.from, q.to));
    },
  );
}
