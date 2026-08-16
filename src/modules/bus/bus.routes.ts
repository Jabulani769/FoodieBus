import type { FastifyInstance, FastifyRequest } from 'fastify';
import { busService } from './bus.service.js';
import {
  assignDriverSchema,
  bookingParamsSchema,
  busParamsSchema,
  checkInSchema,
  createBookingSchema,
  createBusSchema,
  createDriverSchema,
  createRouteSchema,
  createTripSchema,
  listOperatorBusesSchema,
  listOperatorsSchema,
  operatorParamsSchema,
  routeParamsSchema,
  searchTripsSchema,
  tripParamsSchema,
  updateBusSchema,
  updateDriverSchema,
  updateOperatorProfileSchema,
  updateRouteSchema,
  updateTripSchema,
  updateTripLocationSchema,
  updateTripStatusSchema,
} from './bus.schema.js';
import { authenticate, authorize } from '../../shared/middleware/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAuditLog } from '../../shared/audit/audit.js';
import { prisma } from '../../shared/db/prisma.js';

function requireUser(request: FastifyRequest): NonNullable<typeof request.user> {
  if (!request.user) {
    throw AppError.unauthorized();
  }
  return request.user;
}

async function requireOperatorId(userId: string): Promise<string> {
  const operator = await prisma.operatorProfile.findUnique({ where: { userId } });
  if (!operator) {
    throw AppError.notFound('Operator profile not found — has the OPERATOR role been assigned?');
  }
  return operator.id;
}

export async function registerBusRoutes(app: FastifyInstance): Promise<void> {
  // ---- Operator profiles ----

  app.get(
    '/operators',
    {
      schema: {
        tags: ['bus'],
        summary: 'List active operators',
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
                    businessName: { type: 'string' },
                    description: { type: 'string' },
                    phone: { type: 'string' },
                    logoUrl: { type: 'string' },
                    licenseNumber: { type: 'string' },
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
      const q = listOperatorsSchema.parse({ querystring: request.query }).querystring;
      const result = await busService.listOperators(q.page, q.limit);
      return reply.send(result);
    },
  );

  app.get(
    '/operators/:id',
    {
      schema: {
        tags: ['bus'],
        summary: 'Get an operator profile by id',
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              businessName: { type: 'string' },
              description: { type: 'string' },
              phone: { type: 'string' },
              logoUrl: { type: 'string' },
              licenseNumber: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = operatorParamsSchema.parse(request).params;
      const operator = await busService.getOperatorById(id);
      return reply.send(operator);
    },
  );

  app.get(
    '/operators/me/profile',
    {
      preHandler: [authenticate, authorize('OPERATOR')],
      schema: {
        tags: ['bus'],
        summary: 'Get the authenticated operator profile',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              businessName: { type: 'string' },
              description: { type: 'string' },
              phone: { type: 'string' },
              logoUrl: { type: 'string' },
              licenseNumber: { type: 'string' },
              isActive: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const user = requireUser(request);
      const operator = await busService.getOperatorByUserId(user.id);
      return reply.send(operator);
    },
  );

  app.patch(
    '/operators/me/profile',
    {
      preHandler: [authenticate, authorize('OPERATOR')],
      schema: {
        tags: ['bus'],
        summary: 'Update the authenticated operator profile',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            businessName: { type: 'string' },
            description: { type: 'string' },
            phone: { type: 'string' },
            logoUrl: { type: 'string' },
            licenseNumber: { type: 'string' },
          },
        },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const data = updateOperatorProfileSchema.parse({ body: request.body }).body;
      const result = await busService.updateOperatorProfile(actor.id, data);
      await writeAuditLog({
        actorId: actor.id,
        action: 'operator_profile.update',
        entity: 'operator_profile',
        entityId: result.id,
        details: data,
        ipAddress: request.ip,
      });
      return reply.send(result);
    },
  );

  // ---- Buses ----

  app.get(
    '/operators/:operatorId/buses',
    {
      schema: {
        tags: ['bus'],
        summary: 'List an operator buses',
        params: { type: 'object', properties: { operatorId: { type: 'string' } } },
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
                    name: { type: 'string' },
                    plateNumber: { type: 'string' },
                    capacity: { type: 'integer' },
                    busType: { type: 'string' },
                    isActive: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { operatorId } = listOperatorBusesSchema.parse(request).params;
      const result = await busService.listOperatorBuses(operatorId);
      return reply.send(result);
    },
  );

  app.post(
    '/buses',
    {
      preHandler: [authenticate, authorize('OPERATOR')],
      schema: {
        tags: ['bus'],
        summary: 'Register a bus on the authenticated operator profile',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            plateNumber: { type: 'string' },
            capacity: { type: 'integer', minimum: 1, maximum: 200 },
            busType: { type: 'string', enum: ['STANDARD', 'VIP', 'EXECUTIVE'] },
          },
          required: ['name', 'plateNumber', 'capacity'],
        },
        response: { 201: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const operatorId = await requireOperatorId(actor.id);
      const data = createBusSchema.parse({ body: request.body }).body;
      const bus = await busService.createBus(operatorId, data);
      await writeAuditLog({
        actorId: actor.id,
        action: 'bus.create',
        entity: 'bus',
        entityId: bus.id,
        details: { name: data.name, plateNumber: data.plateNumber, capacity: data.capacity },
        ipAddress: request.ip,
      });
      return reply.code(201).send(bus);
    },
  );

  app.patch(
    '/buses/:id',
    {
      preHandler: [authenticate, authorize('OPERATOR')],
      schema: {
        tags: ['bus'],
        summary: 'Update an own bus (operator only)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            plateNumber: { type: 'string' },
            capacity: { type: 'integer', minimum: 1, maximum: 200 },
            busType: { type: 'string', enum: ['STANDARD', 'VIP', 'EXECUTIVE'] },
            isActive: { type: 'boolean' },
          },
        },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const operatorId = await requireOperatorId(actor.id);
      const parsed = updateBusSchema.parse(request);
      const bus = await busService.updateBus(parsed.params.id, operatorId, parsed.body);
      await writeAuditLog({
        actorId: actor.id,
        action: 'bus.update',
        entity: 'bus',
        entityId: parsed.params.id,
        details: parsed.body,
        ipAddress: request.ip,
      });
      return reply.send(bus);
    },
  );

  app.delete(
    '/buses/:id',
    {
      preHandler: [authenticate, authorize('OPERATOR', 'SUPER_ADMIN')],
      schema: {
        tags: ['bus'],
        summary: 'Delete a bus (own operator or super admin)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 204: { type: 'null' } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = busParamsSchema.parse(request).params;

      if (actor.role === 'OPERATOR') {
        const operatorId = await requireOperatorId(actor.id);
        const bus = await prisma.bus.findUnique({ where: { id } });
        if (!bus) throw AppError.notFound('Bus not found');
        if (bus.operatorId !== operatorId) {
          throw AppError.forbidden('You can only delete your own buses');
        }
        await busService.deleteBus(id);
      } else {
        await busService.deleteBus(id);
      }

      await writeAuditLog({
        actorId: actor.id,
        action: 'bus.delete',
        entity: 'bus',
        entityId: id,
        ipAddress: request.ip,
      });
      return reply.code(204).send();
    },
  );

  // ---- Routes ----

  app.get(
    '/bus-routes',
    {
      schema: {
        tags: ['bus'],
        summary: 'List active routes',
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
                    fromCity: { type: 'string' },
                    toCity: { type: 'string' },
                    basePrice: { type: 'string' },
                    distanceKm: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const result = await busService.listRoutes();
      return reply.send(result);
    },
  );

  app.post(
    '/bus-routes',
    {
      preHandler: [authenticate, authorize('SUPER_ADMIN', 'ADMIN')],
      schema: {
        tags: ['bus'],
        summary: 'Create a route (admin only)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            fromCity: { type: 'string' },
            toCity: { type: 'string' },
            basePrice: { type: 'number' },
            distanceKm: { type: 'integer', minimum: 1 },
          },
          required: ['fromCity', 'toCity', 'basePrice'],
        },
        response: { 201: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const data = createRouteSchema.parse({ body: request.body }).body;
      const route = await busService.createRoute(data);
      await writeAuditLog({
        actorId: actor.id,
        action: 'route.create',
        entity: 'route',
        entityId: route.id,
        details: { fromCity: data.fromCity, toCity: data.toCity, basePrice: data.basePrice },
        ipAddress: request.ip,
      });
      return reply.code(201).send(route);
    },
  );

  app.patch(
    '/bus-routes/:id',
    {
      preHandler: [authenticate, authorize('SUPER_ADMIN', 'ADMIN')],
      schema: {
        tags: ['bus'],
        summary: 'Update a route (admin only)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            fromCity: { type: 'string' },
            toCity: { type: 'string' },
            basePrice: { type: 'number' },
            distanceKm: { type: 'integer', minimum: 1 },
            isActive: { type: 'boolean' },
          },
        },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const parsed = updateRouteSchema.parse(request);
      const route = await busService.updateRoute(parsed.params.id, parsed.body);
      await writeAuditLog({
        actorId: actor.id,
        action: 'route.update',
        entity: 'route',
        entityId: parsed.params.id,
        details: parsed.body,
        ipAddress: request.ip,
      });
      return reply.send(route);
    },
  );

  app.delete(
    '/bus-routes/:id',
    {
      preHandler: [authenticate, authorize('SUPER_ADMIN')],
      schema: {
        tags: ['bus'],
        summary: 'Delete a route (super admin only)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 204: { type: 'null' } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = routeParamsSchema.parse(request).params;
      await busService.deleteRoute(id);
      await writeAuditLog({
        actorId: actor.id,
        action: 'route.delete',
        entity: 'route',
        entityId: id,
        ipAddress: request.ip,
      });
      return reply.code(204).send();
    },
  );

  // ---- Trips ----

  app.get(
    '/trips/search',
    {
      schema: {
        tags: ['bus'],
        summary: 'Search trips by route and date',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            fromCity: { type: 'string' },
            toCity: { type: 'string' },
            date: { type: 'string' },
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
                    departureTime: { type: 'string' },
                    arrivalTime: { type: 'string' },
                    price: { type: 'string' },
                    status: { type: 'string' },
                    operator: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        businessName: { type: 'string' },
                      },
                    },
                    route: {
                      type: 'object',
                      properties: {
                        fromCity: { type: 'string' },
                        toCity: { type: 'string' },
                      },
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
      const q = searchTripsSchema.parse({ querystring: request.query ?? {} }).querystring;
      const result = await busService.searchTrips(q.fromCity, q.toCity, q.date, q.page, q.limit);
      return reply.send(result);
    },
  );

  app.get(
    '/trips/:id',
    {
      schema: {
        tags: ['bus'],
        summary: 'Get a trip by id with its seat map',
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              departureTime: { type: 'string' },
              arrivalTime: { type: 'string' },
              price: { type: 'string' },
              status: { type: 'string' },
              operator: {
                type: 'object',
                properties: { id: { type: 'string' }, businessName: { type: 'string' } },
              },
              route: {
                type: 'object',
                properties: { fromCity: { type: 'string' }, toCity: { type: 'string' } },
              },
              bus: {
                type: 'object',
                properties: { id: { type: 'string' }, name: { type: 'string' } },
              },
              seats: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    seatNumber: { type: 'string' },
                    status: { type: 'string' },
                  },
                },
              },
              rating: {
                type: 'object',
                properties: { average: { type: 'number' }, count: { type: 'integer' } },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = tripParamsSchema.parse(request).params;
      const trip = await busService.getTripById(id);
      return reply.send(trip);
    },
  );

  app.post(
    '/trips',
    {
      preHandler: [authenticate, authorize('OPERATOR')],
      schema: {
        tags: ['bus'],
        summary: 'Schedule a trip and generate its seat inventory',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            routeId: { type: 'string' },
            busId: { type: 'string' },
            departureTime: { type: 'string', format: 'date-time' },
            arrivalTime: { type: 'string', format: 'date-time' },
            price: { type: 'number' },
          },
          required: ['routeId', 'busId', 'departureTime', 'arrivalTime', 'price'],
        },
        response: { 201: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const operatorId = await requireOperatorId(actor.id);
      const data = createTripSchema.parse({ body: request.body }).body;
      const trip = await busService.createTrip(operatorId, data);
      await writeAuditLog({
        actorId: actor.id,
        action: 'trip.create',
        entity: 'trip',
        entityId: trip.id,
        details: { routeId: data.routeId, busId: data.busId, price: data.price },
        ipAddress: request.ip,
      });
      return reply.code(201).send(trip);
    },
  );

  app.patch(
    '/trips/:id',
    {
      preHandler: [authenticate, authorize('OPERATOR')],
      schema: {
        tags: ['bus'],
        summary: 'Update an own trip (operator only)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            departureTime: { type: 'string', format: 'date-time' },
            arrivalTime: { type: 'string', format: 'date-time' },
            price: { type: 'number' },
          },
        },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const operatorId = await requireOperatorId(actor.id);
      const parsed = updateTripSchema.parse(request);
      const trip = await busService.updateTrip(parsed.params.id, operatorId, parsed.body);
      await writeAuditLog({
        actorId: actor.id,
        action: 'trip.update',
        entity: 'trip',
        entityId: parsed.params.id,
        details: parsed.body,
        ipAddress: request.ip,
      });
      return reply.send(trip);
    },
  );

  app.patch(
    '/trips/:id/status',
    {
      preHandler: [authenticate, authorize('OPERATOR', 'DRIVER')],
      schema: {
        tags: ['bus'],
        summary: 'Update own/assigned trip status (operator or assigned driver)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['SCHEDULED', 'BOARDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'],
            },
          },
          required: ['status'],
        },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const parsed = updateTripStatusSchema.parse(request);
      const trip = await busService.updateTripStatus(
        parsed.params.id,
        { id: actor.id, role: actor.role },
        parsed.body.status,
      );
      await writeAuditLog({
        actorId: actor.id,
        action: 'trip.status',
        entity: 'trip',
        entityId: parsed.params.id,
        details: { status: parsed.body.status },
        ipAddress: request.ip,
      });
      return reply.send(trip);
    },
  );

  app.delete(
    '/trips/:id',
    {
      preHandler: [authenticate, authorize('OPERATOR', 'SUPER_ADMIN')],
      schema: {
        tags: ['bus'],
        summary: 'Delete a trip (own operator or super admin)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 204: { type: 'null' } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = tripParamsSchema.parse(request).params;

      if (actor.role === 'OPERATOR') {
        const operatorId = await requireOperatorId(actor.id);
        const trip = await prisma.trip.findUnique({ where: { id } });
        if (!trip) throw AppError.notFound('Trip not found');
        if (trip.operatorId !== operatorId) {
          throw AppError.forbidden('You can only delete your own trips');
        }
        await busService.deleteTrip(id);
      } else {
        await busService.deleteTrip(id);
      }

      await writeAuditLog({
        actorId: actor.id,
        action: 'trip.delete',
        entity: 'trip',
        entityId: id,
        ipAddress: request.ip,
      });
      return reply.code(204).send();
    },
  );

  // ---- Bookings ----

  app.post(
    '/bookings',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['bus'],
        summary: 'Book a seat on a trip (any authenticated user)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            tripId: { type: 'string' },
            seatNumber: { type: 'string' },
            passengerName: { type: 'string' },
            passengerPhone: { type: 'string' },
          },
          required: ['tripId', 'seatNumber', 'passengerName', 'passengerPhone'],
        },
        response: { 201: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const data = createBookingSchema.parse({ body: request.body }).body;
      const booking = await busService.createBooking(data.tripId, data.seatNumber, actor.id, data);
      await writeAuditLog({
        actorId: actor.id,
        action: 'booking.create',
        entity: 'booking',
        entityId: booking.id,
        details: { tripId: data.tripId, seatNumber: data.seatNumber },
        ipAddress: request.ip,
      });
      return reply.code(201).send(booking);
    },
  );

  app.get(
    '/bookings/me',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['bus'],
        summary: 'List the authenticated user bookings',
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
                    status: { type: 'string' },
                    totalAmount: { type: 'string' },
                    createdAt: { type: 'string' },
                    seat: {
                      type: 'object',
                      properties: { seatNumber: { type: 'string' } },
                    },
                    trip: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        departureTime: { type: 'string' },
                        arrivalTime: { type: 'string' },
                        price: { type: 'string' },
                        route: {
                          type: 'object',
                          properties: {
                            fromCity: { type: 'string' },
                            toCity: { type: 'string' },
                          },
                        },
                      },
                    },
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
      const result = await busService.listBookingsByPassenger(actor.id);
      return reply.send(result);
    },
  );

  app.post(
    '/bookings/:id/cancel',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['bus'],
        summary: 'Cancel an own booking and release its seat',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = bookingParamsSchema.parse(request).params;
      const booking = await busService.cancelBooking(id, actor.id);
      await writeAuditLog({
        actorId: actor.id,
        action: 'booking.cancel',
        entity: 'booking',
        entityId: id,
        ipAddress: request.ip,
      });
      return reply.send(booking);
    },
  );

  // ---- Driver management (OPERATOR) ----

  app.get(
    '/drivers/me',
    {
      preHandler: [authenticate, authorize('OPERATOR')],
      schema: {
        tags: ['bus'],
        summary: 'List own drivers',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: { items: { type: 'array' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const operatorId = await requireOperatorId(actor.id);
      const items = await prisma.driverProfile.findMany({
        where: { operatorId },
        include: { user: { select: { id: true, fullName: true, email: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return reply.send({ items });
    },
  );

  app.post(
    '/drivers',
    {
      preHandler: [authenticate, authorize('OPERATOR')],
      schema: {
        tags: ['bus'],
        summary: 'Register a driver (operator only)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            fullName: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
            password: { type: 'string' },
            licenseNumber: { type: 'string' },
          },
          required: ['fullName', 'phone', 'email', 'password'],
        },
        response: { 201: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const operatorId = await requireOperatorId(actor.id);
      const parsed = createDriverSchema.parse(request);
      const driver = await busService.createDriver(parsed.body, operatorId, actor.role);
      await writeAuditLog({
        actorId: actor.id,
        action: 'driver.create',
        entity: 'driver',
        entityId: driver.id,
        ipAddress: request.ip,
      });
      return reply.code(201).send(driver);
    },
  );

  app.patch(
    '/drivers/:id',
    {
      preHandler: [authenticate, authorize('OPERATOR')],
      schema: {
        tags: ['bus'],
        summary: 'Update a driver profile (operator only)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            fullName: { type: 'string' },
            licenseNumber: { type: 'string' },
            phone: { type: 'string' },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const operatorId = await requireOperatorId(actor.id);
      const parsed = updateDriverSchema.parse(request);
      const driver = await busService.updateDriver(parsed.params.id, parsed.body, operatorId);
      return reply.send(driver);
    },
  );

  app.delete(
    '/drivers/:id',
    {
      preHandler: [authenticate, authorize('OPERATOR')],
      schema: {
        tags: ['bus'],
        summary: 'Deactivate a driver (operator only)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const operatorId = await requireOperatorId(actor.id);
      const parsed = updateDriverSchema.parse(request);
      await busService.deactivateDriver(parsed.params.id, operatorId);
      return reply.send({ id: parsed.params.id });
    },
  );

  // ---- Trip fulfillment (OPERATOR / assigned DRIVER) ----

  app.post(
    '/trips/:id/assign-driver',
    {
      preHandler: [authenticate, authorize('OPERATOR')],
      schema: {
        tags: ['bus'],
        summary: 'Assign a driver to an own trip',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: { driverId: { type: 'string' } },
          required: ['driverId'],
        },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const operatorId = await requireOperatorId(actor.id);
      const parsed = assignDriverSchema.parse(request);
      return reply.send(
        await busService.assignDriver(parsed.params.id, parsed.body.driverId, operatorId),
      );
    },
  );

  app.post(
    '/trips/:id/check-in',
    {
      preHandler: [authenticate, authorize('OPERATOR', 'DRIVER')],
      schema: {
        tags: ['bus'],
        summary: 'Check in a passenger for a trip',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: { bookingId: { type: 'string' } },
          required: ['bookingId'],
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const parsed = checkInSchema.parse(request);
      return reply.send(
        await busService.checkInPassenger(parsed.params.id, parsed.body.bookingId, actor.id),
      );
    },
  );

  app.get(
    '/trips/:id/manifest',
    {
      preHandler: [authenticate, authorize('OPERATOR', 'DRIVER')],
      schema: {
        tags: ['bus'],
        summary: 'Passenger manifest for a trip',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = tripParamsSchema.parse(request).params;
      return reply.send(await busService.getManifest(id, actor.id));
    },
  );

  app.patch(
    '/trips/:id/location',
    {
      preHandler: [authenticate, authorize('DRIVER')],
      schema: {
        tags: ['bus'],
        summary: 'Update live bus location (assigned driver, while in transit)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lng: { type: 'number', minimum: -180, maximum: 180 },
          },
          required: ['lat', 'lng'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              tripId: { type: 'string' },
              lat: { type: 'number' },
              lng: { type: 'number' },
              updatedAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const parsed = updateTripLocationSchema.parse(request);
      return reply.send(
        await busService.updateTripLocation(
          parsed.params.id,
          parsed.body.lat,
          parsed.body.lng,
          actor.id,
        ),
      );
    },
  );

  app.get(
    '/trips/:id/location',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['bus'],
        summary: 'Get the latest live location for a trip',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: {
          200: {
            type: 'object',
            properties: {
              tripId: { type: 'string' },
              lat: { type: 'number' },
              lng: { type: 'number' },
              updatedAt: { type: 'string' },
              stale: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const { id } = tripParamsSchema.parse(request).params;
      return reply.send(await busService.getTripLocation(id));
    },
  );
}
