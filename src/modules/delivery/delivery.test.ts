import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma.js';
import { createUser } from '../auth/auth.service.js';
import { busService } from '../bus/bus.service.js';

describe('delivery module', () => {
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

  async function createBusForOperator(operatorId: string) {
    return prisma.bus.create({
      data: {
        operatorId,
        name: 'Test Coach',
        plateNumber: `BC-${Math.random().toString(36).slice(2, 8)}`,
        capacity: 4,
        busType: 'STANDARD',
      },
    });
  }

  async function createRoute() {
    return prisma.route.create({
      data: { fromCity: 'Lilongwe', toCity: 'Mzuzu', basePrice: 15000, distanceKm: 350 },
    });
  }

  async function createTripForOperator(operatorId: string) {
    const route = await createRoute();
    const bus = await createBusForOperator(operatorId);
    const trip = await busService.createTrip(operatorId, {
      routeId: route.id,
      busId: bus.id,
      departureTime: '2026-08-20T08:00:00+02:00',
      arrivalTime: '2026-08-20T12:30:00+02:00',
      price: 18000,
    });
    return prisma.trip.findUnique({ where: { id: trip.id } });
  }

  async function createCategory() {
    return prisma.foodCategory.create({
      data: {
        name: `Cat-${Math.random().toString(36).slice(2)}`,
        slug: `cat-${Math.random().toString(36).slice(2)}`,
      },
    });
  }

  async function createDish(
    vendorId: string,
    overrides: { name?: string; price?: number; isAvailable?: boolean } = {},
  ) {
    const cat = await createCategory();
    return prisma.dish.create({
      data: {
        vendorId,
        categoryId: cat.id,
        name: overrides.name ?? `Dish-${Math.random().toString(36).slice(2)}`,
        price: overrides.price ?? 5000,
        isAvailable: overrides.isAvailable ?? true,
      },
    });
  }

  async function createConfirmedBooking(studentUserId: string, operatorId: string) {
    const trip = await createTripForOperator(operatorId);
    const seat = await prisma.seatInventory.findFirst({
      where: { tripId: trip.id, status: 'AVAILABLE' },
    });
    const booking = await busService.createBooking(trip.id, seat!.seatNumber, studentUserId, {
      passengerName: 'Passenger One',
      passengerPhone: '+265991000000',
    });
    await busService.confirmBooking(booking.id);
    const confirmed = await prisma.booking.findUnique({ where: { id: booking.id } });
    return { trip, booking: confirmed!, seat };
  }

  describe('POST /food-orders', () => {
    it('places a food order on a confirmed booking', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      const vendor = await createVendorUser();
      const { booking } = await createConfirmedBooking(
        student.user.id,
        operator.operatorProfile!.id,
      );
      const dish = await createDish(vendor.vendorProfile!.id, { price: 5000 });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/food-orders',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: {
          bookingId: booking.id,
          items: [{ dishId: dish.id, quantity: 2 }],
          note: 'No onions',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeTruthy();
      expect(body.totalAmount).toBe('10000');
      expect(body.status).toBe('PLACED');
      expect(body.items[0].quantity).toBe(2);
      expect(body.vendor.businessName).toBe('Test Vendor');
      expect(body.booking.id).toBe(booking.id);
    });

    it('rejects ordering for another passenger booking', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      const other = await createStudentUser();
      const vendor = await createVendorUser();
      const { booking } = await createConfirmedBooking(
        student.user.id,
        operator.operatorProfile!.id,
      );
      const dish = await createDish(vendor.vendorProfile!.id);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/food-orders',
        headers: { authorization: `Bearer ${other.accessToken}` },
        payload: { bookingId: booking.id, items: [{ dishId: dish.id, quantity: 1 }] },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects ordering on a pending booking', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      const vendor = await createVendorUser();
      const trip = await createTripForOperator(operator.operatorProfile!.id);
      const seat = await prisma.seatInventory.findFirst({ where: { tripId: trip.id } });
      const booking = await busService.createBooking(trip.id, seat!.seatNumber, student.user.id, {
        passengerName: 'Passenger One',
        passengerPhone: '+265991000000',
      });
      const dish = await createDish(vendor.vendorProfile!.id);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/food-orders',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId: booking.id, items: [{ dishId: dish.id, quantity: 1 }] },
      });
      expect(res.statusCode).toBe(409);
    });

    it('rejects items from multiple vendors', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      const vendorA = await createVendorUser('Vendor A');
      const vendorB = await createVendorUser('Vendor B');
      const { booking } = await createConfirmedBooking(
        student.user.id,
        operator.operatorProfile!.id,
      );
      const dishA = await createDish(vendorA.vendorProfile!.id);
      const dishB = await createDish(vendorB.vendorProfile!.id);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/food-orders',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: {
          bookingId: booking.id,
          items: [
            { dishId: dishA.id, quantity: 1 },
            { dishId: dishB.id, quantity: 1 },
          ],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects an unavailable dish', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      const vendor = await createVendorUser();
      const { booking } = await createConfirmedBooking(
        student.user.id,
        operator.operatorProfile!.id,
      );
      const dish = await createDish(vendor.vendorProfile!.id, { isAvailable: false });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/food-orders',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId: booking.id, items: [{ dishId: dish.id, quantity: 1 }] },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('GET /food-orders', () => {
    it('lists only own food orders', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      const other = await createStudentUser();
      const vendor = await createVendorUser();
      const { booking } = await createConfirmedBooking(
        student.user.id,
        operator.operatorProfile!.id,
      );
      const dish = await createDish(vendor.vendorProfile!.id);

      await app.inject({
        method: 'POST',
        url: '/api/v1/food-orders',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId: booking.id, items: [{ dishId: dish.id, quantity: 1 }] },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/food-orders/me',
        headers: { authorization: `Bearer ${other.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(0);
    });

    it('requires authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/food-orders/me' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('PATCH /food-orders/:id/status', () => {
    it('vendor advances the order status one step at a time', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      const vendor = await createVendorUser();
      const { booking } = await createConfirmedBooking(
        student.user.id,
        operator.operatorProfile!.id,
      );
      const dish = await createDish(vendor.vendorProfile!.id);

      const placed = await app.inject({
        method: 'POST',
        url: '/api/v1/food-orders',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId: booking.id, items: [{ dishId: dish.id, quantity: 1 }] },
      });
      const orderId = placed.json().id as string;

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/food-orders/${orderId}/status`,
        headers: { authorization: `Bearer ${vendor.accessToken}` },
        payload: { status: 'PREPARING' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('PREPARING');

      const ready = await app.inject({
        method: 'PATCH',
        url: `/api/v1/food-orders/${orderId}/status`,
        headers: { authorization: `Bearer ${vendor.accessToken}` },
        payload: { status: 'READY' },
      });
      expect(ready.json().status).toBe('READY');
    });

    it('rejects skipping a status step', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      const vendor = await createVendorUser();
      const { booking } = await createConfirmedBooking(
        student.user.id,
        operator.operatorProfile!.id,
      );
      const dish = await createDish(vendor.vendorProfile!.id);

      const placed = await app.inject({
        method: 'POST',
        url: '/api/v1/food-orders',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId: booking.id, items: [{ dishId: dish.id, quantity: 1 }] },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/food-orders/${placed.json().id}/status`,
        headers: { authorization: `Bearer ${vendor.accessToken}` },
        payload: { status: 'READY' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('rejects another vendor updating the order', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      const vendorA = await createVendorUser('Vendor A');
      const vendorB = await createVendorUser('Vendor B');
      const { booking } = await createConfirmedBooking(
        student.user.id,
        operator.operatorProfile!.id,
      );
      const dish = await createDish(vendorA.vendorProfile!.id);

      const placed = await app.inject({
        method: 'POST',
        url: '/api/v1/food-orders',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId: booking.id, items: [{ dishId: dish.id, quantity: 1 }] },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/food-orders/${placed.json().id}/status`,
        headers: { authorization: `Bearer ${vendorB.accessToken}` },
        payload: { status: 'PREPARING' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /vendors/:vendorId/orders', () => {
    it('lists orders for a vendor', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      const vendor = await createVendorUser();
      const { booking } = await createConfirmedBooking(
        student.user.id,
        operator.operatorProfile!.id,
      );
      const dish = await createDish(vendor.vendorProfile!.id);

      const placed = await app.inject({
        method: 'POST',
        url: '/api/v1/food-orders',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId: booking.id, items: [{ dishId: dish.id, quantity: 1 }] },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/vendors/${vendor.vendorProfile!.id}/orders`,
        headers: { authorization: `Bearer ${vendor.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBe(1);
      expect(res.json().items[0].id).toBe(placed.json().id);
    });

    it('rejects another vendor viewing the orders', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      const vendorA = await createVendorUser('Vendor A');
      const vendorB = await createVendorUser('Vendor B');
      const { booking } = await createConfirmedBooking(
        student.user.id,
        operator.operatorProfile!.id,
      );
      const dish = await createDish(vendorA.vendorProfile!.id);

      await app.inject({
        method: 'POST',
        url: '/api/v1/food-orders',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId: booking.id, items: [{ dishId: dish.id, quantity: 1 }] },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/vendors/${vendorA.vendorProfile!.id}/orders`,
        headers: { authorization: `Bearer ${vendorB.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('filters vendor orders by status', async () => {
      const operator = await createOperatorUser();
      const student = await createStudentUser();
      const vendor = await createVendorUser();
      const { booking } = await createConfirmedBooking(
        student.user.id,
        operator.operatorProfile!.id,
      );
      const dish = await createDish(vendor.vendorProfile!.id);

      await app.inject({
        method: 'POST',
        url: '/api/v1/food-orders',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId: booking.id, items: [{ dishId: dish.id, quantity: 1 }] },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/vendors/${vendor.vendorProfile!.id}/orders?status=PREPARING`,
        headers: { authorization: `Bearer ${vendor.accessToken}` },
      });
      expect(res.json().total).toBe(0);
    });
  });
});
