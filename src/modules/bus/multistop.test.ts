import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma.js';
import { createUser } from '../auth/auth.service.js';

describe('bus module — multi-stop routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
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

  async function createOperatorUser(name = 'Multi Stop Operator') {
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

  async function createBusForOperator(operatorId: string, capacity = 4) {
    const plateNumber = `BC-${Math.random().toString(36).slice(2, 8)}`;
    return prisma.bus.create({
      data: {
        operatorId,
        name: 'Multi Stop Coach',
        plateNumber,
        capacity,
        busType: 'STANDARD',
      },
    });
  }

  async function createRoute(overrides: { fromCity?: string; toCity?: string } = {}) {
    return prisma.route.create({
      data: {
        fromCity: overrides.fromCity ?? 'Blantyre',
        toCity: overrides.toCity ?? 'Mzuzu',
        basePrice: 30000,
        distanceKm: 700,
      },
    });
  }

  async function createTripForOperator(
    operatorId: string,
    overrides: { routeId?: string; busId?: string; price?: number } = {},
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
    const arrival = new Date(departure.getTime() + 7 * 3600000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/trips',
      headers: { authorization: `Bearer ${login.json().accessToken}` },
      payload: {
        routeId: route!.id,
        busId: bus!.id,
        departureTime: departure.toISOString(),
        arrivalTime: arrival.toISOString(),
        price: overrides.price ?? 30000,
      },
    });
    expect(res.statusCode).toBe(201);
    return { id: res.json().id as string, route: route!, bus: bus! };
  }

  async function setStops(
    routeId: string,
    stops: Array<{ city: string; departureOffsetMinutes: number; segmentPrice: number }>,
    token: string,
  ) {
    return app.inject({
      method: 'PUT',
      url: `/api/v1/bus-routes/${routeId}/stops`,
      headers: { authorization: `Bearer ${token}` },
      payload: { stops },
    });
  }

  describe('Route stops management', () => {
    it('admin can replace the stops of a route', async () => {
      const token = await createAdminUser();
      const route = await createRoute({ fromCity: 'Blantyre', toCity: 'Mzuzu' });
      const res = await setStops(
        route.id,
        [
          { city: 'Blantyre', departureOffsetMinutes: 0, segmentPrice: 0 },
          { city: 'Lilongwe', departureOffsetMinutes: 240, segmentPrice: 12000 },
          { city: 'Mzuzu', departureOffsetMinutes: 420, segmentPrice: 18000 },
        ],
        token,
      );
      expect(res.statusCode).toBe(200);
      const stops = await prisma.routeStop.findMany({
        where: { routeId: route.id },
        orderBy: { order: 'asc' },
      });
      expect(stops.length).toBe(3);
      expect(stops[0].segmentPrice.toString()).toBe('0');
      expect(stops[1].segmentPrice.toString()).toBe('12000');
    });

    it('forbids a student from changing stops', async () => {
      const student = await createStudentUser();
      const route = await createRoute();
      const res = await setStops(
        route.id,
        [
          { city: 'Blantyre', departureOffsetMinutes: 0, segmentPrice: 0 },
          { city: 'Mzuzu', departureOffsetMinutes: 420, segmentPrice: 30000 },
        ],
        student.accessToken,
      );
      expect(res.statusCode).toBe(403);
    });

    it('requires the first stop to match the route origin', async () => {
      const token = await createAdminUser();
      const route = await createRoute({ fromCity: 'Blantyre', toCity: 'Mzuzu' });
      const res = await setStops(
        route.id,
        [
          { city: 'Lilongwe', departureOffsetMinutes: 0, segmentPrice: 0 },
          { city: 'Mzuzu', departureOffsetMinutes: 420, segmentPrice: 30000 },
        ],
        token,
      );
      expect(res.statusCode).toBe(400);
    });

    it('requires the last stop to match the route destination', async () => {
      const token = await createAdminUser();
      const route = await createRoute({ fromCity: 'Blantyre', toCity: 'Mzuzu' });
      const res = await setStops(
        route.id,
        [
          { city: 'Blantyre', departureOffsetMinutes: 0, segmentPrice: 0 },
          { city: 'Lilongwe', departureOffsetMinutes: 240, segmentPrice: 30000 },
        ],
        token,
      );
      expect(res.statusCode).toBe(400);
    });

    it('requires strictly increasing departure offsets', async () => {
      const token = await createAdminUser();
      const route = await createRoute({ fromCity: 'Blantyre', toCity: 'Mzuzu' });
      const res = await setStops(
        route.id,
        [
          { city: 'Blantyre', departureOffsetMinutes: 0, segmentPrice: 0 },
          { city: 'Lilongwe', departureOffsetMinutes: 0, segmentPrice: 12000 },
          { city: 'Mzuzu', departureOffsetMinutes: 420, segmentPrice: 18000 },
        ],
        token,
      );
      expect(res.statusCode).toBe(400);
    });

    it('GET /bus-routes includes stops in the response', async () => {
      const token = await createAdminUser();
      const route = await createRoute({ fromCity: 'Blantyre', toCity: 'Mzuzu' });
      await setStops(
        route.id,
        [
          { city: 'Blantyre', departureOffsetMinutes: 0, segmentPrice: 0 },
          { city: 'Lilongwe', departureOffsetMinutes: 240, segmentPrice: 12000 },
          { city: 'Mzuzu', departureOffsetMinutes: 420, segmentPrice: 18000 },
        ],
        token,
      );
      const res = await app.inject({ method: 'GET', url: '/api/v1/bus-routes' });
      expect(res.statusCode).toBe(200);
      const listed = res.json().items.find((r: { id: string }) => r.id === route.id);
      expect(listed.stops.length).toBe(3);
      expect(listed.stops[1].city).toBe('Lilongwe');
    });
  });

  describe('Segment booking', () => {
    async function setup() {
      const token = await createAdminUser();
      const route = await createRoute({ fromCity: 'Blantyre', toCity: 'Mzuzu' });
      await setStops(
        route.id,
        [
          { city: 'Blantyre', departureOffsetMinutes: 0, segmentPrice: 0 },
          { city: 'Lilongwe', departureOffsetMinutes: 240, segmentPrice: 12000 },
          { city: 'Mzuzu', departureOffsetMinutes: 420, segmentPrice: 18000 },
        ],
        token,
      );
      const stops = await prisma.routeStop.findMany({
        where: { routeId: route.id },
        orderBy: { order: 'asc' },
      });
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id, { routeId: route.id });
      return { route, stops, trip, operator };
    }

    it('prices a booking by the sum of segment prices', async () => {
      const { stops, trip } = await setup();
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
          originStopId: stops[0].id,
          destinationStopId: stops[2].id,
        },
      });
      expect(res.statusCode).toBe(201);
      const booking = await prisma.booking.findUnique({ where: { id: res.json().id } });
      expect(booking?.totalAmount.toString()).toBe('30000');
      expect(booking?.originStopOrder).toBe(0);
      expect(booking?.destinationStopOrder).toBe(2);
    });

    it('prices a partial segment (Blantyre → Lilongwe = 12000)', async () => {
      const { stops, trip } = await setup();
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
          originStopId: stops[0].id,
          destinationStopId: stops[1].id,
        },
      });
      expect(res.statusCode).toBe(201);
      const booking = await prisma.booking.findUnique({ where: { id: res.json().id } });
      expect(booking?.totalAmount.toString()).toBe('12000');
    });

    it('rejects a booking when stops are not on the trip route', async () => {
      const { trip } = await setup();
      const otherRoute = await createRoute({ fromCity: 'Zomba', toCity: 'Salima' });
      const otherStops = await prisma.routeStop.createMany({
        data: [
          {
            routeId: otherRoute.id,
            order: 0,
            city: 'Zomba',
            departureOffsetMinutes: 0,
            segmentPrice: 0,
          },
          {
            routeId: otherRoute.id,
            order: 1,
            city: 'Salima',
            departureOffsetMinutes: 120,
            segmentPrice: 5000,
          },
        ],
      });
      void otherStops;
      const [foreign] = await prisma.routeStop.findMany({ where: { routeId: otherRoute.id } });
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
          originStopId: foreign.id,
          destinationStopId: foreign.id,
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects when only one stop is provided', async () => {
      const { stops, trip } = await setup();
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
          originStopId: stops[0].id,
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a booking whose origin comes after the destination', async () => {
      const { stops, trip } = await setup();
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
          originStopId: stops[2].id,
          destinationStopId: stops[0].id,
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Segment seat overlap', () => {
    async function setup() {
      const token = await createAdminUser();
      const route = await createRoute({ fromCity: 'Blantyre', toCity: 'Mzuzu' });
      await setStops(
        route.id,
        [
          { city: 'Blantyre', departureOffsetMinutes: 0, segmentPrice: 0 },
          { city: 'Lilongwe', departureOffsetMinutes: 240, segmentPrice: 12000 },
          { city: 'Mzuzu', departureOffsetMinutes: 420, segmentPrice: 18000 },
        ],
        token,
      );
      const stops = await prisma.routeStop.findMany({
        where: { routeId: route.id },
        orderBy: { order: 'asc' },
      });
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id, { routeId: route.id });
      return { stops, trip };
    }

    async function book(
      stops: { id: string }[],
      trip: { id: string },
      originIdx: number,
      destIdx: number,
      token: string,
    ) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          tripId: trip.id,
          seatNumber: '1',
          passengerName: 'Jane Doe',
          passengerPhone: '+265991111222',
          originStopId: stops[originIdx].id,
          destinationStopId: stops[destIdx].id,
        },
      });
    }

    it('allows non-overlapping segments on the same seat', async () => {
      const { stops, trip } = await setup();
      const studentA = await createStudentUser();
      const studentB = await createStudentUser();
      const first = await book(stops, trip, 0, 1, studentA.accessToken);
      expect(first.statusCode).toBe(201);
      const second = await book(stops, trip, 1, 2, studentB.accessToken);
      expect(second.statusCode).toBe(201);
    });

    it('rejects an overlapping segment on the same seat', async () => {
      const { stops, trip } = await setup();
      const studentA = await createStudentUser();
      const studentB = await createStudentUser();
      const first = await book(stops, trip, 0, 1, studentA.accessToken);
      expect(first.statusCode).toBe(201);
      const second = await book(stops, trip, 0, 2, studentB.accessToken);
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe('SEAT_UNAVAILABLE');
    });

    it('rejects a full-route booking on a seat with any segment held', async () => {
      const { stops, trip } = await setup();
      const studentA = await createStudentUser();
      const studentB = await createStudentUser();
      const first = await book(stops, trip, 1, 2, studentA.accessToken);
      expect(first.statusCode).toBe(201);
      const second = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${studentB.accessToken}` },
        payload: {
          tripId: trip.id,
          seatNumber: '1',
          passengerName: 'Jane Doe',
          passengerPhone: '+265991111222',
        },
      });
      expect(second.statusCode).toBe(409);
    });

    it('frees the seat when the last segment booking is cancelled', async () => {
      const { stops, trip } = await setup();
      const student = await createStudentUser();
      const first = await book(stops, trip, 0, 1, student.accessToken);
      expect(first.statusCode).toBe(201);
      const second = await book(stops, trip, 1, 2, student.accessToken);
      expect(second.statusCode).toBe(201);
      const firstId = first.json().id as string;
      await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${firstId}/cancel`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      const seat = await prisma.seatInventory.findFirst({
        where: { tripId: trip.id, seatNumber: '1' },
      });
      expect(seat?.status).toBe('HELD');
      const secondId = second.json().id as string;
      await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${secondId}/cancel`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      const after = await prisma.seatInventory.findFirst({
        where: { tripId: trip.id, seatNumber: '1' },
      });
      expect(after?.status).toBe('AVAILABLE');
    });
  });

  describe('Multi-stop search', () => {
    it('finds a trip when searching by an intermediate stop', async () => {
      const token = await createAdminUser();
      const route = await createRoute({ fromCity: 'Blantyre', toCity: 'Mzuzu' });
      await setStops(
        route.id,
        [
          { city: 'Blantyre', departureOffsetMinutes: 0, segmentPrice: 0 },
          { city: 'Lilongwe', departureOffsetMinutes: 240, segmentPrice: 12000 },
          { city: 'Mzuzu', departureOffsetMinutes: 420, segmentPrice: 18000 },
        ],
        token,
      );
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id, { routeId: route.id });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trips/search?fromCity=Lilongwe&toCity=Mzuzu',
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().items.map((t: { id: string }) => t.id);
      expect(ids).toContain(trip.id);
    });

    it('returns the stops on each search result', async () => {
      const token = await createAdminUser();
      const route = await createRoute({ fromCity: 'Blantyre', toCity: 'Mzuzu' });
      await setStops(
        route.id,
        [
          { city: 'Blantyre', departureOffsetMinutes: 0, segmentPrice: 0 },
          { city: 'Lilongwe', departureOffsetMinutes: 240, segmentPrice: 12000 },
          { city: 'Mzuzu', departureOffsetMinutes: 420, segmentPrice: 18000 },
        ],
        token,
      );
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id, { routeId: route.id });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trips/search?fromCity=Blantyre&toCity=Mzuzu',
      });
      expect(res.statusCode).toBe(200);
      const found = res.json().items.find((t: { id: string }) => t.id === trip.id);
      expect(found.route.stops.length).toBe(3);
    });
  });
});
