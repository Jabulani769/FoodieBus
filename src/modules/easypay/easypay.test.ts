import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma.js';
import { createUser } from '../auth/auth.service.js';

describe('easypay adapter', () => {
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
    await prisma.payment.deleteMany();
    await prisma.foodOrderItem.deleteMany();
    await prisma.foodOrder.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.seatInventory.deleteMany();
    await prisma.trip.deleteMany();
    await prisma.route.deleteMany();
    await prisma.bus.deleteMany();
    await prisma.operatorProfile.deleteMany();
    await prisma.dish.deleteMany();
    await prisma.vendorProfile.deleteMany();
    await prisma.foodCategory.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.otpCode.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createVendor() {
    const user = await createUser(
      {
        email: 'vendor@foodiebus.mw',
        phone: '+265998000111',
        password: 'password123',
        fullName: 'Tasty Vendor',
        role: 'VENDOR',
      },
      'SUPER_ADMIN',
    );
    const vendor = await prisma.vendorProfile.update({
      where: { userId: user.id },
      data: { businessName: 'KFC Area 24', logoUrl: 'https://x/kfc.png' },
    });
    return vendor;
  }

  async function extractOtpCode(phone: string): Promise<string> {
    const user = await prisma.user.findFirstOrThrow({ where: { phone } });
    const note = await prisma.notification.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    const match = /(\d{6})/.exec(note.body);
    if (!match) throw new Error('OTP code not found in notification body');
    return match[1];
  }

  async function loginAs(email: string, password: string) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: email, password },
    });
  }

  async function studentToken(email = 'stu@foodiebus.mw', phone = '+265995000111') {
    await createUser(
      { email, phone, password: 'password123', fullName: 'Student User', role: 'STUDENT' },
      'SUPER_ADMIN',
    );
    const login = await loginAs(email, 'password123');
    return (login.json() as { accessToken: string }).accessToken;
  }

  async function setupTripWithSeats() {
    const op = await createUser(
      {
        email: 'op@foodiebus.mw',
        phone: '+265994000111',
        password: 'password123',
        fullName: 'Op',
        role: 'OPERATOR',
      },
      'SUPER_ADMIN',
    );
    const operator = await prisma.operatorProfile.findUniqueOrThrow({ where: { userId: op.id } });
    const route = await prisma.route.create({
      data: { fromCity: 'Blantyre', toCity: 'Lilongwe', basePrice: 15000 },
    });
    const bus = await prisma.bus.create({
      data: {
        operatorId: operator.id,
        name: 'Test Coach',
        plateNumber: 'OP-TRIP',
        capacity: 4,
        busType: 'STANDARD',
      },
    });
    const opLogin = await loginAs('op@foodiebus.mw', 'password123');
    const departure = new Date(Date.now() + 3 * 86400000);
    departure.setHours(8, 0, 0, 0);
    const arrival = new Date(departure.getTime() + 4 * 3600000);
    const tripRes = await app.inject({
      method: 'POST',
      url: '/api/v1/trips',
      headers: {
        authorization: `Bearer ${(opLogin.json() as { accessToken: string }).accessToken}`,
      },
      payload: {
        routeId: route.id,
        busId: bus.id,
        departureTime: departure.toISOString(),
        arrivalTime: arrival.toISOString(),
        price: 18000,
      },
    });
    return { tripId: tripRes.json().id as string };
  }

  describe('Auth (phone OTP)', () => {
    it('rejects a malformed phone with the spec error envelope', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/request-otp',
        payload: { phone: 'bad' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ status: 'error', error_code: 'VALIDATION_ERROR' });
    });

    it('issues a token+user on verify-otp', async () => {
      const phone = '+265991111222';
      await createUser(
        {
          email: 'easy@foodiebus.mw',
          phone,
          password: 'password123',
          fullName: 'Easy Pay User',
          role: 'STUDENT',
        },
        'SUPER_ADMIN',
      );

      const req = await app.inject({
        method: 'POST',
        url: '/auth/request-otp',
        payload: { phone },
      });
      expect(req.statusCode).toBe(200);
      expect(req.json()).toMatchObject({
        status: 'success',
        expires_in_seconds: expect.any(Number),
      });

      const code = await extractOtpCode(phone);
      const verify = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { phone, code },
      });
      expect(verify.statusCode).toBe(200);
      const body = verify.json();
      expect(body.token).toEqual(expect.any(String));
      expect(body.user).toMatchObject({ phone, name: 'Easy Pay User' });
    });

    it('rejects an invalid OTP', async () => {
      const phone = '+265992222333';
      await createUser(
        {
          email: 'easy2@foodiebus.mw',
          phone,
          password: 'password123',
          fullName: 'Easy Pay User 2',
          role: 'STUDENT',
        },
        'SUPER_ADMIN',
      );
      await app.inject({ method: 'POST', url: '/auth/request-otp', payload: { phone } });
      const verify = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { phone, code: '000000' },
      });
      expect(verify.statusCode).toBe(401);
      expect(verify.json()).toMatchObject({ status: 'error', error_code: 'UNAUTHORIZED' });
    });
  });

  describe('Kitchens & menu', () => {
    it('lists kitchens in snake_case', async () => {
      await createVendor();
      const res = await app.inject({ method: 'GET', url: '/kitchens' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Array<Record<string, unknown>>;
      expect(body[0]).toMatchObject({
        id: expect.any(String),
        name: 'KFC Area 24',
        logo_url: 'https://x/kfc.png',
      });
    });

    it('returns a vendor menu', async () => {
      const vendor = await createVendor();
      const cat = await prisma.foodCategory.create({ data: { name: 'Burgers', slug: 'burgers' } });
      const dish = await prisma.dish.create({
        data: {
          vendorId: vendor.id,
          categoryId: cat.id,
          name: 'Zinger Burger',
          price: 4500,
          isAvailable: true,
        },
      });
      const res = await app.inject({ method: 'GET', url: `/kitchens/${vendor.id}/menu` });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Array<Record<string, unknown>>;
      expect(body[0]).toMatchObject({
        id: dish.id,
        name: 'Zinger Burger',
        price: 4500,
        is_available: true,
      });
    });
  });

  describe('Bus search', () => {
    it('returns an array (empty when no data)', async () => {
      const res = await app.inject({ method: 'GET', url: '/bus/search?from=Blantyre&to=Lilongwe' });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    });
  });

  describe('User profile & notifications', () => {
    it('updates profile and lists notifications with the spec envelope', async () => {
      const phone = '+265993333444';
      await createUser(
        {
          email: 'easy3@foodiebus.mw',
          phone,
          password: 'password123',
          fullName: 'Easy Pay User 3',
          role: 'STUDENT',
        },
        'SUPER_ADMIN',
      );
      await app.inject({ method: 'POST', url: '/auth/request-otp', payload: { phone } });
      const code = await extractOtpCode(phone);
      const verify = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { phone, code },
      });
      const token = (verify.json() as { token: string }).token;
      const auth = { authorization: `Bearer ${token}` };

      const update = await app.inject({
        method: 'PUT',
        url: '/user/profile/update',
        headers: auth,
        payload: { name: 'New Name' },
      });
      expect(update.statusCode).toBe(200);
      expect(update.json()).toMatchObject({ status: 'success' });

      const notifs = await app.inject({ method: 'GET', url: '/user/notifications', headers: auth });
      expect(notifs.statusCode).toBe(200);
      expect(Array.isArray(notifs.json())).toBe(true);
    });

    it('rejects unauthenticated profile access', async () => {
      const res = await app.inject({ method: 'GET', url: '/user/profile' });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ status: 'error', error_code: 'UNAUTHORIZED' });
    });
  });

  describe('Bus booking', () => {
    it('books a seat and returns a ticket with qr_code_data', async () => {
      const token = await studentToken();
      const { tripId } = await setupTripWithSeats();
      const res = await app.inject({
        method: 'POST',
        url: '/bus/book',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          route_id: tripId,
          passenger_name: 'Student User',
          passenger_phone: '+265995000111',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as Record<string, unknown>;
      expect(body).toMatchObject({
        ticket_id: expect.any(String),
        qr_code_data: expect.any(String),
        status: 'active',
      });
    });

    it('rejects an unknown trip with the spec error envelope', async () => {
      const token = await studentToken('stu2@foodiebus.mw', '+265995000222');
      const res = await app.inject({
        method: 'POST',
        url: '/bus/book',
        headers: { authorization: `Bearer ${token}` },
        payload: { route_id: '00000000-0000-0000-0000-000000000000' },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ status: 'error', error_code: 'NOT_FOUND' });
    });
  });

  describe('Food orders', () => {
    it('places a food order against the passenger’s confirmed booking', async () => {
      const token = await studentToken('stu3@foodiebus.mw', '+265995000333');
      const { tripId } = await setupTripWithSeats();
      const vendor = await createVendor();
      const cat = await prisma.foodCategory.create({
        data: { name: 'Burgers', slug: 'burgers-2' },
      });
      const dish = await prisma.dish.create({
        data: {
          vendorId: vendor.id,
          categoryId: cat.id,
          name: 'Zinger Burger',
          price: 4500,
          isAvailable: true,
        },
      });

      const seat = await prisma.seatInventory.findFirstOrThrow({
        where: { tripId, status: 'AVAILABLE' },
      });
      const student = await prisma.user.findFirstOrThrow({ where: { phone: '+265995000333' } });
      await prisma.booking.create({
        data: {
          tripId,
          seatId: seat.id,
          passengerId: student.id,
          passengerName: 'Student User',
          passengerPhone: '+265995000333',
          status: 'CONFIRMED',
          totalAmount: 4500,
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/orders/food',
        headers: { authorization: `Bearer ${token}` },
        payload: { kitchen_id: vendor.id, items: [{ item_id: dish.id, quantity: 1 }] },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as Record<string, unknown>;
      expect(body).toMatchObject({
        order_id: expect.any(String),
        status: 'preparing',
        estimated_delivery_minutes: 30,
      });
    });

    it('rejects a food order with no confirmed booking', async () => {
      const token = await studentToken('stu4@foodiebus.mw', '+265995000444');
      const vendor = await createVendor();
      const cat = await prisma.foodCategory.create({ data: { name: 'Snacks', slug: 'snacks' } });
      const dish = await prisma.dish.create({
        data: {
          vendorId: vendor.id,
          categoryId: cat.id,
          name: 'Chips',
          price: 2000,
          isAvailable: true,
        },
      });
      const res = await app.inject({
        method: 'POST',
        url: '/orders/food',
        headers: { authorization: `Bearer ${token}` },
        payload: { kitchen_id: vendor.id, items: [{ item_id: dish.id, quantity: 1 }] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ status: 'error', error_code: 'VALIDATION_ERROR' });
    });
  });
});
