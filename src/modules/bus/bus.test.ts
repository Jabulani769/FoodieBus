import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma.js';
import { createUser } from '../auth/auth.service.js';
import { busService } from './bus.service.js';

describe('bus module', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.rating.deleteMany();
    await prisma.deviceToken.deleteMany();
    await prisma.favorite.deleteMany();
    await prisma.couponUsage.deleteMany();
    await prisma.coupon.deleteMany();
    await prisma.webhookEvent.deleteMany();

    await prisma.reconciliationMismatch.deleteMany();

    await prisma.driverTripPayout.deleteMany();
    await prisma.refund.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.foodOrderItem.deleteMany();
    await prisma.foodOrder.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.seatInventory.deleteMany();
    await prisma.trip.deleteMany();
    await prisma.routeStop.deleteMany();
    await prisma.route.deleteMany();
    await prisma.bus.deleteMany();
    await prisma.operatorProfile.deleteMany();
    await prisma.vendorProfile.deleteMany();
    await prisma.foodCategory.deleteMany();
    await prisma.platformSetting.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createTestUser(overrides: Partial<Parameters<typeof createUser>[0]> = {}) {
    const email = `user-${Math.random().toString(36).slice(2)}@foodiebus.mw`;
    const phone = `+26599${String(Math.floor(1000000 + Math.random() * 9000000))}`;
    const user = await createUser(
      {
        email,
        phone,
        password: 'password123',
        fullName: 'Test User',
        role: 'STUDENT',
        ...overrides,
      },
      'SUPER_ADMIN',
    );
    return { ...user, email, phone };
  }

  async function loginAs(email: string, password: string) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: email, password },
    });
  }

  async function createOperatorUser(name = 'Test Operator') {
    const user = await createTestUser({ fullName: name, role: 'OPERATOR' });
    const login = await loginAs(user.email, 'password123');
    return {
      user,
      email: user.email,
      phone: user.phone,
      accessToken: login.json().accessToken,
      operatorProfile: await prisma.operatorProfile.findUnique({ where: { userId: user.id } }),
    };
  }

  async function createAdminUser() {
    const user = await createTestUser({ role: 'SUPER_ADMIN' });
    const login = await loginAs(user.email, 'password123');
    return login.json().accessToken;
  }

  async function createStudentUser() {
    const user = await createTestUser({ role: 'STUDENT' });
    const login = await loginAs(user.email, 'password123');
    return { user, accessToken: login.json().accessToken };
  }

  async function createBusForOperator(
    operatorId: string,
    overrides: { plateNumber?: string; capacity?: number } = {},
  ) {
    const plateNumber = overrides.plateNumber ?? `BC-${Math.random().toString(36).slice(2, 8)}`;
    return prisma.bus.create({
      data: {
        operatorId,
        name: 'Test Coach',
        plateNumber,
        capacity: overrides.capacity ?? 4,
        busType: 'STANDARD',
      },
    });
  }

  async function createRoute(overrides: { fromCity?: string; toCity?: string } = {}) {
    return prisma.route.create({
      data: {
        fromCity: overrides.fromCity ?? 'Lilongwe',
        toCity: overrides.toCity ?? 'Mzuzu',
        basePrice: 15000,
        distanceKm: 350,
      },
    });
  }

  async function createTripForOperator(
    operatorId: string,
    overrides: { routeId?: string; busId?: string } = {},
  ) {
    const operator = await prisma.operatorProfile.findUnique({
      where: { id: operatorId },
      include: { user: { select: { email: true } } },
    });
    const route = overrides.routeId
      ? await prisma.route.findUnique({ where: { id: overrides.routeId } })
      : await createRoute();
    const bus = overrides.busId
      ? await prisma.bus.findUnique({ where: { id: overrides.busId } })
      : await createBusForOperator(operatorId);
    const login = await loginAs(operator!.user.email, 'password123');
    const departure = new Date(Date.now() + 3 * 86400000);
    departure.setHours(8, 0, 0, 0);
    const arrival = new Date(departure.getTime() + 4 * 3600000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/trips',
      headers: { authorization: `Bearer ${login.json().accessToken}` },
      payload: {
        routeId: route!.id,
        busId: bus!.id,
        departureTime: departure.toISOString(),
        arrivalTime: arrival.toISOString(),
        price: 18000,
      },
    });
    expect(res.statusCode).toBe(201);
    return { id: res.json().id as string, route: route!, bus: bus! };
  }

  describe('Operators', () => {
    it('auto-creates an operator profile when a user gets the OPERATOR role', async () => {
      const user = await createTestUser({ role: 'OPERATOR' });
      const profile = await prisma.operatorProfile.findUnique({ where: { userId: user.id } });
      expect(profile).not.toBeNull();
      expect(profile?.businessName).toBe('Test User');
    });

    it('GET /operators lists active operators with pagination', async () => {
      await createOperatorUser('Operator A');
      await createOperatorUser('Operator B');
      const res = await app.inject({ method: 'GET', url: '/api/v1/operators?page=1&limit=2' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.page).toBe(1);
      expect(body.total).toBeGreaterThanOrEqual(2);
    });

    it('GET /operators/:id returns a valid operator', async () => {
      const operator = await createOperatorUser('Lilongwe Coaches');
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/operators/${operator.operatorProfile?.id}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().businessName).toBe('Lilongwe Coaches');
    });

    it('GET /operators/:id returns 404 for a non-existent operator', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/operators/${crypto.randomUUID()}`,
      });
      expect(res.statusCode).toBe(404);
    });

    it('GET /operators/me/profile returns own profile', async () => {
      const operator = await createOperatorUser();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/operators/me/profile',
        headers: { authorization: `Bearer ${operator.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(operator.operatorProfile?.id);
    });

    it('PATCH /operators/me/profile updates own profile', async () => {
      const operator = await createOperatorUser();
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/operators/me/profile',
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: { businessName: 'Northern Coaches', licenseNumber: 'LIC-001' },
      });
      expect(res.statusCode).toBe(200);
      const updated = await prisma.operatorProfile.findUnique({
        where: { id: operator.operatorProfile?.id },
      });
      expect(updated?.businessName).toBe('Northern Coaches');
      expect(updated?.licenseNumber).toBe('LIC-001');
    });

    it('PATCH /operators/me/profile forbids a student', async () => {
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/operators/me/profile',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { businessName: 'Hacked' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Buses', () => {
    it('POST /buses registers a bus on own operator profile', async () => {
      const operator = await createOperatorUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/buses',
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: { name: 'Express 1', plateNumber: 'BC-1234', capacity: 50 },
      });
      expect(res.statusCode).toBe(201);
      const bus = await prisma.bus.findUnique({ where: { id: res.json().id } });
      expect(bus?.operatorId).toBe(operator.operatorProfile?.id);
      expect(bus?.capacity).toBe(50);
    });

    it('POST /buses forbids a vendor', async () => {
      const vendor = await createTestUser({ role: 'VENDOR' });
      const login = await loginAs(vendor.email, 'password123');
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/buses',
        headers: { authorization: `Bearer ${login.json().accessToken}` },
        payload: { name: 'X', plateNumber: 'BC-1', capacity: 10 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /buses rejects a duplicate plate number with 409', async () => {
      const operator = await createOperatorUser();
      await createBusForOperator(operator.operatorProfile!.id, { plateNumber: 'BC-DUP' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/buses',
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: { name: 'X', plateNumber: 'BC-DUP', capacity: 10 },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
    });

    it('GET /operators/:operatorId/buses lists operator buses', async () => {
      const operator = await createOperatorUser();
      await createBusForOperator(operator.operatorProfile!.id);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/operators/${operator.operatorProfile?.id}/buses`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(1);
    });

    it('PATCH /buses/:id updates own bus', async () => {
      const operator = await createOperatorUser();
      const bus = await createBusForOperator(operator.operatorProfile!.id);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/buses/${bus.id}`,
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: { capacity: 60, busType: 'VIP' },
      });
      expect(res.statusCode).toBe(200);
      const updated = await prisma.bus.findUnique({ where: { id: bus.id } });
      expect(updated?.capacity).toBe(60);
      expect(updated?.busType).toBe('VIP');
    });

    it('PATCH /buses/:id forbids updating another operator bus', async () => {
      const operatorA = await createOperatorUser('Op A');
      const operatorB = await createOperatorUser('Op B');
      const bus = await createBusForOperator(operatorA.operatorProfile!.id);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/buses/${bus.id}`,
        headers: { authorization: `Bearer ${operatorB.accessToken}` },
        payload: { capacity: 1 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE /buses/:id allows the owning operator', async () => {
      const operator = await createOperatorUser();
      const bus = await createBusForOperator(operator.operatorProfile!.id);
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/buses/${bus.id}`,
        headers: { authorization: `Bearer ${operator.accessToken}` },
      });
      expect(res.statusCode).toBe(204);
      expect(await prisma.bus.findUnique({ where: { id: bus.id } })).toBeNull();
    });

    it('DELETE /buses/:id allows super admin', async () => {
      const operator = await createOperatorUser();
      const token = await createAdminUser();
      const bus = await createBusForOperator(operator.operatorProfile!.id);
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/buses/${bus.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(204);
    });

    it('DELETE /buses/:id returns 404 for a non-existent bus', async () => {
      const operator = await createOperatorUser();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/buses/${crypto.randomUUID()}`,
        headers: { authorization: `Bearer ${operator.accessToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Routes', () => {
    it('GET /bus-routes lists active routes', async () => {
      await createRoute();
      const res = await app.inject({ method: 'GET', url: '/api/v1/bus-routes' });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(1);
    });

    it('POST /bus-routes allows admin to create a route', async () => {
      const token = await createAdminUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/bus-routes',
        headers: { authorization: `Bearer ${token}` },
        payload: { fromCity: 'Blantyre', toCity: 'Zomba', basePrice: 9000, distanceKm: 60 },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBeTypeOf('string');
    });

    it('POST /bus-routes rejects a duplicate route with 409', async () => {
      const token = await createAdminUser();
      await createRoute();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/bus-routes',
        headers: { authorization: `Bearer ${token}` },
        payload: { fromCity: 'Lilongwe', toCity: 'Mzuzu', basePrice: 15000 },
      });
      expect(res.statusCode).toBe(409);
    });

    it('POST /bus-routes allows an operator', async () => {
      const operator = await createOperatorUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/bus-routes',
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: { fromCity: 'A', toCity: 'B', basePrice: 1000 },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBeTypeOf('string');
    });

    it('POST /bus-routes forbids a student', async () => {
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/bus-routes',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { fromCity: 'A', toCity: 'B', basePrice: 1000 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE /bus-routes/:id allows super admin', async () => {
      const token = await createAdminUser();
      const route = await createRoute();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/bus-routes/${route.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(204);
      expect(await prisma.route.findUnique({ where: { id: route.id } })).toBeNull();
    });

    it('DELETE /bus-routes/:id forbids an admin', async () => {
      const admin = await createTestUser({ role: 'ADMIN' });
      const login = await loginAs(admin.email, 'password123');
      const route = await createRoute();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/bus-routes/${route.id}`,
        headers: { authorization: `Bearer ${login.json().accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Trips', () => {
    it('POST /trips creates a trip and auto-generates seat inventory', async () => {
      const operator = await createOperatorUser();
      const route = await createRoute();
      const bus = await createBusForOperator(operator.operatorProfile!.id, { capacity: 4 });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trips',
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: {
          routeId: route.id,
          busId: bus.id,
          departureTime: '2026-08-20T08:00:00+02:00',
          arrivalTime: '2026-08-20T12:30:00+02:00',
          price: 18000,
        },
      });
      expect(res.statusCode).toBe(201);
      const seats = await prisma.seatInventory.findMany({ where: { tripId: res.json().id } });
      expect(seats.length).toBe(4);
      expect(seats.map((s) => s.seatNumber).sort()).toEqual(['1', '2', '3', '4']);
    });

    it('POST /trips forbids a vendor from creating trips', async () => {
      const vendor = await createTestUser({ role: 'VENDOR' });
      const login = await loginAs(vendor.email, 'password123');
      const route = await createRoute();
      const operator = await createOperatorUser();
      const bus = await createBusForOperator(operator.operatorProfile!.id);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trips',
        headers: { authorization: `Bearer ${login.json().accessToken}` },
        payload: {
          routeId: route.id,
          busId: bus.id,
          departureTime: '2026-08-20T08:00:00+02:00',
          arrivalTime: '2026-08-20T12:30:00+02:00',
          price: 18000,
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /trips forbids using another operator bus', async () => {
      const operator = await createOperatorUser();
      const other = await createOperatorUser('Other Operator');
      const route = await createRoute();
      const bus = await createBusForOperator(other.operatorProfile!.id);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trips',
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: {
          routeId: route.id,
          busId: bus.id,
          departureTime: '2026-08-20T08:00:00+02:00',
          arrivalTime: '2026-08-20T12:30:00+02:00',
          price: 18000,
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('GET /trips/search finds trips by route and date', async () => {
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const tripRow = await prisma.trip.findUnique({ where: { id: trip.id } });
      const date = tripRow!.departureTime.toISOString().slice(0, 10);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/trips/search?fromCity=Lilongwe&toCity=Mzuzu&date=${date}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(1);
    });

    it('GET /trips/:id returns a trip with its seat map', async () => {
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const res = await app.inject({ method: 'GET', url: `/api/v1/trips/${trip.id}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().route.fromCity).toBe('Lilongwe');
      expect(res.json().seats.length).toBe(4);
    });

    it('PATCH /trips/:id/status updates trip status', async () => {
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/trips/${trip.id}/status`,
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: { status: 'BOARDING' },
      });
      expect(res.statusCode).toBe(200);
      const updated = await prisma.trip.findUnique({ where: { id: trip.id } });
      expect(updated?.status).toBe('BOARDING');
    });

    it('PATCH /trips/:id/status allows a direct transition after boarding', async () => {
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      await prisma.trip.update({ where: { id: trip.id }, data: { status: 'IN_TRANSIT' } });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/trips/${trip.id}/status`,
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: { status: 'COMPLETED' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('PATCH /trips/:id/status forbids another operator', async () => {
      const operator = await createOperatorUser();
      const other = await createOperatorUser('Other');
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/trips/${trip.id}/status`,
        headers: { authorization: `Bearer ${other.accessToken}` },
        payload: { status: 'COMPLETED' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE /trips/:id allows the owning operator', async () => {
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/trips/${trip.id}`,
        headers: { authorization: `Bearer ${operator.accessToken}` },
      });
      expect(res.statusCode).toBe(204);
      expect(await prisma.trip.findUnique({ where: { id: trip.id } })).toBeNull();
    });

    it('DELETE /trips/:id returns 409 when the trip has bookings', async () => {
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: {
          tripId: trip.id,
          seatNumber: '1',
          passengerName: 'Jane Doe',
          passengerPhone: '+265991111222',
        },
      });
      expect(res.statusCode).toBe(201);

      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/trips/${trip.id}`,
        headers: { authorization: `Bearer ${operator.accessToken}` },
      });
      expect(del.statusCode).toBe(409);
    });
  });

  describe('Bookings', () => {
    it('POST /bookings books an available seat (PENDING, seat HELD)', async () => {
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: {
          tripId: trip.id,
          seatNumber: '1',
          passengerName: 'Jane Doe',
          passengerPhone: '+265991111222',
        },
      });
      expect(res.statusCode).toBe(201);
      const booking = await prisma.booking.findUnique({ where: { id: res.json().id } });
      expect(booking?.status).toBe('PENDING');
      expect(booking?.passengerId).toBe(student.user.id);
      expect(booking?.totalAmount.toString()).toBe('18000');
      const seat = await prisma.seatInventory.findFirst({
        where: { tripId: trip.id, seatNumber: '1' },
      });
      expect(seat?.status).toBe('HELD');
    });

    it('POST /bookings rejects a seat that was already booked', async () => {
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const studentA = await createStudentUser();
      const studentB = await createTestUser();
      const loginB = await loginAs(studentB.email, 'password123');
      const payload = {
        tripId: trip.id,
        seatNumber: '1',
        passengerName: 'Jane Doe',
        passengerPhone: '+265991111222',
      };
      const first = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${studentA.accessToken}` },
        payload,
      });
      expect(first.statusCode).toBe(201);
      const second = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${loginB.json().accessToken}` },
        payload,
      });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe('SEAT_UNAVAILABLE');
    });

    it('POST /bookings returns 404 for a seat that does not exist', async () => {
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: {
          tripId: trip.id,
          seatNumber: '99',
          passengerName: 'Jane Doe',
          passengerPhone: '+265991111222',
        },
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /bookings requires authentication', async () => {
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        payload: {
          tripId: trip.id,
          seatNumber: '1',
          passengerName: 'Jane Doe',
          passengerPhone: '+265991111222',
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /bookings/me lists own bookings', async () => {
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const student = await createStudentUser();
      await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: {
          tripId: trip.id,
          seatNumber: '2',
          passengerName: 'Jane Doe',
          passengerPhone: '+265991111222',
        },
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/bookings/me',
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(1);
      expect(res.json().items[0].seat.seatNumber).toBe('2');
    });

    it('POST /bookings/:id/cancel cancels own booking and frees the seat', async () => {
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const student = await createStudentUser();
      const book = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: {
          tripId: trip.id,
          seatNumber: '3',
          passengerName: 'Jane Doe',
          passengerPhone: '+265991111222',
        },
      });
      const bookingId = book.json().id as string;
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingId}/cancel`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      expect(booking?.status).toBe('CANCELLED');
      const seat = await prisma.seatInventory.findFirst({
        where: { tripId: trip.id, seatNumber: '3' },
      });
      expect(seat?.status).toBe('AVAILABLE');
    });

    it('POST /bookings/:id/cancel forbids cancelling another user booking', async () => {
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const studentA = await createStudentUser();
      const studentB = await createTestUser();
      const loginB = await loginAs(studentB.email, 'password123');
      const book = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${studentA.accessToken}` },
        payload: {
          tripId: trip.id,
          seatNumber: '4',
          passengerName: 'Jane Doe',
          passengerPhone: '+265991111222',
        },
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${book.json().id}/cancel`,
        headers: { authorization: `Bearer ${loginB.json().accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Cancellation policy & rescheduling', () => {
    async function createPaidBooking(studentId: string, operatorId: string, tripId: string) {
      const seat = await prisma.seatInventory.findFirst({
        where: { tripId, status: 'AVAILABLE' },
      });
      const booking = await busService.createBooking(tripId, seat!.seatNumber, studentId, {
        passengerName: 'Passenger',
        passengerPhone: '+265991000000',
      });
      await busService.confirmBooking(booking.id);
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          txRef: `TX-${Math.random().toString(36).slice(2, 10)}`,
          amount: 18000,
          currency: 'MWK',
          status: 'PAID',
          paidAt: new Date(),
        },
      });
      return booking.id;
    }

    it('full refund when cancelled well before departure', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const bookingId = await createPaidBooking(
        student.user.id,
        operator.operatorProfile!.id,
        trip.id,
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingId}/cancel`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(200);

      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      expect(booking?.status).toBe('CANCELLED');
      const refund = await prisma.refund.findFirst({
        where: { payment: { bookingId } },
      });
      expect(refund).toBeTruthy();
      expect(Number(refund?.amount)).toBe(18000);
      expect(refund?.reason).toContain('Passenger cancellation');
    });

    it('partial refund when cancelled within the policy window', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      const route = await prisma.route.create({
        data: { fromCity: 'Lilongwe', toCity: 'Blantyre', basePrice: 15000 },
      });
      const bus = await prisma.bus.create({
        data: {
          operatorId: operator.operatorProfile!.id,
          name: 'Coach',
          plateNumber: `PL-${Math.random().toString(36).slice(2, 8)}`,
          capacity: 4,
        },
      });
      const departure = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const arrival = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const trip = await busService.createTrip(operator.operatorProfile!.id, {
        routeId: route.id,
        busId: bus.id,
        departureTime: departure.toISOString(),
        arrivalTime: arrival.toISOString(),
        price: 18000,
      });
      await prisma.platformSetting.upsert({
        where: { key: 'cancellation_policy' },
        update: { value: { cancelBeforeHours: 24, refundPercent: 50, rescheduleFee: 2000 } },
        create: {
          key: 'cancellation_policy',
          value: { cancelBeforeHours: 24, refundPercent: 50, rescheduleFee: 2000 },
        },
      });
      const bookingId = await createPaidBooking(
        student.user.id,
        operator.operatorProfile!.id,
        trip.id,
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingId}/cancel`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const refund = await prisma.refund.findFirst({ where: { payment: { bookingId } } });
      expect(Number(refund?.amount)).toBe(9000);
    });

    it('reschedules an unpaid booking to another trip with a fee inside the window', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      await prisma.platformSetting.upsert({
        where: { key: 'cancellation_policy' },
        update: { value: { cancelBeforeHours: 24, refundPercent: 50, rescheduleFee: 2000 } },
        create: {
          key: 'cancellation_policy',
          value: { cancelBeforeHours: 24, refundPercent: 50, rescheduleFee: 2000 },
        },
      });
      const route = await prisma.route.create({
        data: { fromCity: 'Lilongwe', toCity: 'Mzuzu', basePrice: 15000, distanceKm: 350 },
      });
      const bus = await prisma.bus.create({
        data: {
          operatorId: operator.operatorProfile!.id,
          name: 'Coach',
          plateNumber: `PL-${Math.random().toString(36).slice(2, 8)}`,
          capacity: 6,
        },
      });
      const nearDeparture = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const nearArrival = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const tripA = await busService.createTrip(operator.operatorProfile!.id, {
        routeId: route.id,
        busId: bus.id,
        departureTime: nearDeparture.toISOString(),
        arrivalTime: nearArrival.toISOString(),
        price: 18000,
      });
      const farDeparture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const farArrival = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000 + 4 * 3600 * 1000);
      const tripB = await busService.createTrip(operator.operatorProfile!.id, {
        routeId: route.id,
        busId: bus.id,
        departureTime: farDeparture.toISOString(),
        arrivalTime: farArrival.toISOString(),
        price: 20000,
      });

      const seatA = await prisma.seatInventory.findFirst({ where: { tripId: tripA.id } });
      const book = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: {
          tripId: tripA.id,
          seatNumber: seatA!.seatNumber,
          passengerName: 'Jane Doe',
          passengerPhone: '+265991111222',
        },
      });
      const bookingId = book.json().id as string;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingId}/reschedule`,
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { tripId: tripB.id, seatNumber: '1' },
      });
      expect(res.statusCode).toBe(200);

      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      expect(booking?.tripId).toBe(tripB.id);
      expect(Number(booking?.totalAmount)).toBe(22000);
      const oldSeat = await prisma.seatInventory.findFirst({
        where: { tripId: tripA.id, seatNumber: seatA!.seatNumber },
      });
      expect(oldSeat?.status).toBe('AVAILABLE');
      const newSeat = await prisma.seatInventory.findFirst({
        where: { tripId: tripB.id, seatNumber: '1' },
      });
      expect(newSeat?.status).toBe('HELD');
    });

    it('rejects rescheduling a confirmed (paid) booking', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const bookingId = await createPaidBooking(
        student.user.id,
        operator.operatorProfile!.id,
        trip.id,
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingId}/reschedule`,
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { tripId: trip.id, seatNumber: '2' },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('Live location', () => {
    // Creates a driver + assigned trip, returns the trip (SCHEDULED by default).
    async function createDriverTrip(status: 'SCHEDULED' | 'IN_TRANSIT' = 'SCHEDULED') {
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const driverRes = await app.inject({
        method: 'POST',
        url: '/api/v1/drivers',
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: {
          fullName: 'Kapiya Mbewe',
          phone: `+26599${String(Math.floor(1000000 + Math.random() * 9000000))}`,
          email: `driver-${Math.random().toString(36).slice(2)}@foodiebus.mw`,
          password: 'password123',
          licenseNumber: 'DL-2026-001',
        },
      });
      expect(driverRes.statusCode).toBe(201);
      const driverId = driverRes.json().id as string;
      const driverUserId = driverRes.json().userId as string;
      const assign = await app.inject({
        method: 'POST',
        url: `/api/v1/trips/${trip.id}/assign-driver`,
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: { driverId },
      });
      expect(assign.statusCode).toBe(200);
      if (status === 'IN_TRANSIT') {
        await prisma.trip.update({ where: { id: trip.id }, data: { status: 'IN_TRANSIT' } });
      }
      const driver = await prisma.user.findUniqueOrThrow({ where: { id: driverUserId } });
      const login = await loginAs(driver.email, 'password123');
      return {
        operator,
        tripId: trip.id,
        driverAccessToken: login.json().accessToken,
        driverUserId,
      };
    }

    it('PATCH /trips/:id/location stores coordinates for an assigned driver in transit', async () => {
      const { tripId, driverAccessToken } = await createDriverTrip('IN_TRANSIT');
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/trips/${tripId}/location`,
        headers: { authorization: `Bearer ${driverAccessToken}` },
        payload: { lat: -13.9669, lng: 33.7873 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().lat).toBe(-13.9669);
      expect(res.json().lng).toBe(33.7873);
      expect(res.json().updatedAt).toBeTypeOf('string');
    });

    it('PATCH /trips/:id/location rejects a driver not assigned to the trip', async () => {
      const { tripId } = await createDriverTrip('IN_TRANSIT');
      const other = await createOperatorUser();
      const otherRoute = await createRoute({ fromCity: 'Blantyre', toCity: 'Zomba' });
      const otherTrip = await createTripForOperator(other.operatorProfile!.id, {
        routeId: otherRoute.id,
      });
      const otherDriverRes = await app.inject({
        method: 'POST',
        url: '/api/v1/drivers',
        headers: { authorization: `Bearer ${other.accessToken}` },
        payload: {
          fullName: 'Other Driver',
          phone: `+26599${String(Math.floor(1000000 + Math.random() * 9000000))}`,
          email: `other-driver-${Math.random().toString(36).slice(2)}@foodiebus.mw`,
          password: 'password123',
        },
      });
      const otherDriverId = otherDriverRes.json().id as string;
      const otherDriverUserId = otherDriverRes.json().userId as string;
      await app.inject({
        method: 'POST',
        url: `/api/v1/trips/${otherTrip.id}/assign-driver`,
        headers: { authorization: `Bearer ${other.accessToken}` },
        payload: { driverId: otherDriverId },
      });
      const otherDriverUser = await prisma.user.findUniqueOrThrow({
        where: { id: otherDriverUserId },
      });
      const login = await loginAs(otherDriverUser.email, 'password123');
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/trips/${tripId}/location`,
        headers: { authorization: `Bearer ${login.json().accessToken}` },
        payload: { lat: -13.9669, lng: 33.7873 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('PATCH /trips/:id/location rejects updates when the trip is not IN_TRANSIT', async () => {
      const { tripId, driverAccessToken } = await createDriverTrip('SCHEDULED');
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/trips/${tripId}/location`,
        headers: { authorization: `Bearer ${driverAccessToken}` },
        payload: { lat: -13.9669, lng: 33.7873 },
      });
      expect(res.statusCode).toBe(409);
    });

    it('PATCH /trips/:id/location rejects an operator (DRIVER role only)', async () => {
      const { operator, tripId } = await createDriverTrip('IN_TRANSIT');
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/trips/${tripId}/location`,
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: { lat: -13.9669, lng: 33.7873 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('PATCH /trips/:id/location rejects out-of-range coordinates', async () => {
      const { tripId, driverAccessToken } = await createDriverTrip('IN_TRANSIT');
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/trips/${tripId}/location`,
        headers: { authorization: `Bearer ${driverAccessToken}` },
        payload: { lat: 95, lng: 33.7873 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /trips/:id/location returns the latest stored coordinates', async () => {
      const { tripId, driverAccessToken } = await createDriverTrip('IN_TRANSIT');
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/trips/${tripId}/location`,
        headers: { authorization: `Bearer ${driverAccessToken}` },
        payload: { lat: -13.9669, lng: 33.7873 },
      });
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/trips/${tripId}/location`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().lat).toBe(-13.9669);
      expect(res.json().lng).toBe(33.7873);
      expect(res.json().stale).toBe(false);
    });

    it('GET /trips/:id/location reports stale when no location was recorded', async () => {
      const { tripId } = await createDriverTrip('IN_TRANSIT');
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/trips/${tripId}/location`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().stale).toBe(true);
      expect(res.json().lat).toBeUndefined();
    });
  });
});
