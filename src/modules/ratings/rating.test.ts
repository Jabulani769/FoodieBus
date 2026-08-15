import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma.js';
import { createUser } from '../auth/auth.service.js';
import { busService } from '../bus/bus.service.js';

describe('ratings module', () => {
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
    await prisma.webhookEvent.deleteMany();

    await prisma.reconciliationMismatch.deleteMany();

    await prisma.driverTripPayout.deleteMany();
    await prisma.foodOrderItem.deleteMany();
    await prisma.foodOrder.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.seatInventory.deleteMany();
    await prisma.trip.deleteMany();
    await prisma.route.deleteMany();
    await prisma.bus.deleteMany();
    await prisma.driverProfile.deleteMany();
    await prisma.operatorProfile.deleteMany();
    await prisma.dish.deleteMany();
    await prisma.foodCategory.deleteMany();
    await prisma.vendorProfile.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createTestUser(overrides: Partial<Parameters<typeof createUser>[0]> = {}) {
    const email = `user-${Math.random().toString(36).slice(2)}@foodiebus.mw`;
    const phone = `+26599${String(Math.floor(1000000 + Math.random() * 9000000))}`;
    const user = await createUser({
      email,
      phone,
      password: 'password123',
      fullName: 'Test User',
      role: 'STUDENT',
      ...overrides,
    });
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
      accessToken: login.json().accessToken,
      operatorProfile: await prisma.operatorProfile.findUnique({ where: { userId: user.id } }),
    };
  }

  async function createVendorUser(name = 'Test Vendor') {
    const user = await createTestUser({ fullName: name, role: 'VENDOR' });
    const login = await loginAs(user.email, 'password123');
    return {
      user,
      email: user.email,
      accessToken: login.json().accessToken,
      vendorProfile: await prisma.vendorProfile.findUnique({ where: { userId: user.id } }),
    };
  }

  async function createStudentUser() {
    const user = await createTestUser({ role: 'STUDENT' });
    const login = await loginAs(user.email, 'password123');
    return { user, accessToken: login.json().accessToken };
  }

  async function createTripForOperator(operatorId: string) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const route = await prisma.route.create({
      data: {
        fromCity: `CityA-${suffix}`,
        toCity: `CityB-${suffix}`,
        basePrice: 15000,
        distanceKm: 350,
      },
    });
    const bus = await prisma.bus.create({
      data: {
        operatorId,
        name: 'Test Coach',
        plateNumber: `BC-${Math.random().toString(36).slice(2, 8)}`,
        capacity: 4,
      },
    });
    const trip = await busService.createTrip(operatorId, {
      routeId: route.id,
      busId: bus.id,
      departureTime: '2026-08-20T08:00:00+02:00',
      arrivalTime: '2026-08-20T12:30:00+02:00',
      price: 18000,
    });
    return prisma.trip.findUnique({ where: { id: trip.id } });
  }

  async function createConfirmedBooking(studentUserId: string, operatorId: string) {
    const trip = await createTripForOperator(operatorId);
    const seat = await prisma.seatInventory.findFirst({ where: { tripId: trip!.id } });
    const booking = await busService.createBooking(trip!.id, seat!.seatNumber, studentUserId, {
      passengerName: 'Passenger One',
      passengerPhone: '+265991000000',
    });
    await busService.confirmBooking(booking.id);
    return {
      trip: trip!,
      booking: (await prisma.booking.findUnique({ where: { id: booking.id } }))!,
    };
  }

  async function createDish(vendorId: string) {
    const cat = await prisma.foodCategory.create({
      data: {
        name: `Cat-${Math.random().toString(36).slice(2)}`,
        slug: `cat-${Math.random().toString(36).slice(2)}`,
      },
    });
    return prisma.dish.create({
      data: {
        vendorId,
        categoryId: cat.id,
        name: `Dish-${Math.random().toString(36).slice(2)}`,
        price: 5000,
      },
    });
  }

  async function createDeliveredFoodOrder(studentUserId: string, vendorId: string, dishId: string) {
    const operator = await createOperatorUser();
    const { booking } = await createConfirmedBooking(studentUserId, operator.operatorProfile!.id);
    const order = await prisma.foodOrder.create({
      data: {
        bookingId: booking.id,
        passengerId: studentUserId,
        tripId: booking.tripId,
        vendorId,
        totalAmount: 5000,
      },
    });
    await prisma.foodOrderItem.create({
      data: { foodOrderId: order.id, dishId, quantity: 1, unitPrice: 5000 },
    });
    await prisma.foodOrder.update({
      where: { id: order.id },
      data: { status: 'DELIVERED_TO_BUS' },
    });
    return order;
  }

  function rate(
    token: string,
    entityType: string,
    entityId: string,
    score: number,
    comment?: string,
  ) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/ratings',
      headers: { authorization: `Bearer ${token}` },
      payload: { entityType, entityId, score, ...(comment ? { comment } : {}) },
    });
  }

  describe('POST /ratings', () => {
    it('rates a trip after a confirmed booking', async () => {
      const student = await createStudentUser();
      const operator = await createOperatorUser();
      const { trip } = await createConfirmedBooking(student.user.id, operator.operatorProfile!.id);

      const res = await rate(student.accessToken, 'TRIP', trip.id, 5, 'Great ride');
      expect(res.statusCode).toBe(201);
      const rating = await prisma.rating.findFirst({ where: { entityType: 'TRIP' } });
      expect(rating?.score).toBe(5);
      expect(rating?.comment).toBe('Great ride');
    });

    it('rates an operator after travelling with them', async () => {
      const student = await createStudentUser();
      const operator = await createOperatorUser();
      await createConfirmedBooking(student.user.id, operator.operatorProfile!.id);

      const res = await rate(student.accessToken, 'OPERATOR', operator.operatorProfile!.id, 4);
      expect(res.statusCode).toBe(201);
    });

    it('rates a dish and vendor after a delivered food order', async () => {
      const student = await createStudentUser();
      const vendor = await createVendorUser();
      const dish = await createDish(vendor.vendorProfile!.id);
      await createDeliveredFoodOrder(student.user.id, vendor.vendorProfile!.id, dish.id);

      const dishRes = await rate(student.accessToken, 'DISH', dish.id, 5);
      expect(dishRes.statusCode).toBe(201);
      const vendorRes = await rate(student.accessToken, 'VENDOR', vendor.vendorProfile!.id, 4);
      expect(vendorRes.statusCode).toBe(201);
    });

    it('rejects a duplicate rating with 409', async () => {
      const student = await createStudentUser();
      const operator = await createOperatorUser();
      const { trip } = await createConfirmedBooking(student.user.id, operator.operatorProfile!.id);

      expect((await rate(student.accessToken, 'TRIP', trip.id, 5)).statusCode).toBe(201);
      const dup = await rate(student.accessToken, 'TRIP', trip.id, 3);
      expect(dup.statusCode).toBe(409);
    });

    it('rejects rating a trip without a confirmed booking', async () => {
      const student = await createStudentUser();
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);

      const res = await rate(student.accessToken, 'TRIP', trip!.id, 5);
      expect(res.statusCode).toBe(403);
    });

    it('rejects rating a dish without a delivered order', async () => {
      const student = await createStudentUser();
      const vendor = await createVendorUser();
      const dish = await createDish(vendor.vendorProfile!.id);

      const res = await rate(student.accessToken, 'DISH', dish.id, 5);
      expect(res.statusCode).toBe(403);
    });

    it('rejects a score out of range', async () => {
      const student = await createStudentUser();
      const operator = await createOperatorUser();
      const { trip } = await createConfirmedBooking(student.user.id, operator.operatorProfile!.id);

      const res = await rate(student.accessToken, 'TRIP', trip.id, 6);
      expect(res.statusCode).toBe(400);
    });

    it('rejects a rating for a non-existent entity', async () => {
      const student = await createStudentUser();
      const res = await rate(
        student.accessToken,
        'TRIP',
        '00000000-0000-0000-0000-000000000000',
        5,
      );
      expect(res.statusCode).toBe(404);
    });

    it('rejects unauthenticated rating', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ratings',
        payload: { entityType: 'TRIP', entityId: 'x', score: 5 },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects a vendor from rating', async () => {
      const vendor = await createVendorUser();
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const res = await rate(vendor.accessToken, 'TRIP', trip!.id, 5);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('PATCH and DELETE /ratings/:id', () => {
    it('updates own rating', async () => {
      const student = await createStudentUser();
      const operator = await createOperatorUser();
      const { trip } = await createConfirmedBooking(student.user.id, operator.operatorProfile!.id);
      const created = await rate(student.accessToken, 'TRIP', trip.id, 5);
      const id = created.json().id as string;

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/ratings/${id}`,
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { score: 2, comment: 'Changed my mind' },
      });
      expect(res.statusCode).toBe(200);
      const rating = await prisma.rating.findUnique({ where: { id } });
      expect(rating?.score).toBe(2);
      expect(rating?.comment).toBe('Changed my mind');
    });

    it('forbids updating another user rating', async () => {
      const studentA = await createStudentUser();
      const studentB = await createStudentUser();
      const operator = await createOperatorUser();
      const { trip } = await createConfirmedBooking(studentA.user.id, operator.operatorProfile!.id);
      const created = await rate(studentA.accessToken, 'TRIP', trip.id, 5);

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/ratings/${created.json().id}`,
        headers: { authorization: `Bearer ${studentB.accessToken}` },
        payload: { score: 1 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('deletes own rating', async () => {
      const student = await createStudentUser();
      const operator = await createOperatorUser();
      const { trip } = await createConfirmedBooking(student.user.id, operator.operatorProfile!.id);
      const created = await rate(student.accessToken, 'TRIP', trip.id, 5);

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/ratings/${created.json().id}`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(204);
      expect(await prisma.rating.count()).toBe(0);
    });

    it('forbids deleting another user rating', async () => {
      const studentA = await createStudentUser();
      const studentB = await createStudentUser();
      const operator = await createOperatorUser();
      const { trip } = await createConfirmedBooking(studentA.user.id, operator.operatorProfile!.id);
      const created = await rate(studentA.accessToken, 'TRIP', trip.id, 5);

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/ratings/${created.json().id}`,
        headers: { authorization: `Bearer ${studentB.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /ratings and aggregates', () => {
    it('lists ratings filtered by entity', async () => {
      const student = await createStudentUser();
      const operator = await createOperatorUser();
      const { trip } = await createConfirmedBooking(student.user.id, operator.operatorProfile!.id);
      await rate(student.accessToken, 'TRIP', trip.id, 5);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/ratings?entityType=TRIP&entityId=${trip.id}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBe(1);
      expect(res.json().items[0].score).toBe(5);
    });

    it('exposes the rating aggregate on trip detail', async () => {
      const studentA = await createStudentUser();
      const studentB = await createStudentUser();
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);

      const seatA = await prisma.seatInventory.findFirst({ where: { tripId: trip!.id } });
      const bookingA = await busService.createBooking(
        trip!.id,
        seatA!.seatNumber,
        studentA.user.id,
        {
          passengerName: 'Passenger A',
          passengerPhone: '+265991000001',
        },
      );
      await busService.confirmBooking(bookingA.id);

      const seatB = await prisma.seatInventory.findFirst({
        where: { tripId: trip!.id, status: 'AVAILABLE' },
      });
      const bookingB = await busService.createBooking(
        trip!.id,
        seatB!.seatNumber,
        studentB.user.id,
        {
          passengerName: 'Passenger B',
          passengerPhone: '+265991000002',
        },
      );
      await busService.confirmBooking(bookingB.id);

      await rate(studentA.accessToken, 'TRIP', trip!.id, 5);
      await rate(studentB.accessToken, 'TRIP', trip!.id, 3);

      const res = await app.inject({ method: 'GET', url: `/api/v1/trips/${trip!.id}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().rating).toEqual({ average: 4, count: 2 });
    });

    it('exposes the rating aggregate on dish detail', async () => {
      const student = await createStudentUser();
      const vendor = await createVendorUser();
      const dish = await createDish(vendor.vendorProfile!.id);
      await createDeliveredFoodOrder(student.user.id, vendor.vendorProfile!.id, dish.id);
      await rate(student.accessToken, 'DISH', dish.id, 4);

      const res = await app.inject({ method: 'GET', url: `/api/v1/dishes/${dish.id}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().rating).toEqual({ average: 4, count: 1 });
    });

    it('returns a zero aggregate when there are no ratings', async () => {
      const operator = await createOperatorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const res = await app.inject({ method: 'GET', url: `/api/v1/trips/${trip!.id}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().rating).toEqual({ average: 0, count: 0 });
    });
  });
});
