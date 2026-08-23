import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma.js';
import { createUser } from '../auth/auth.service.js';
import { busService } from '../bus/bus.service.js';

describe('coupons module', () => {
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

  async function createSuperAdmin() {
    const user = await createTestUser({ role: 'SUPER_ADMIN' });
    const login = await loginAs(user.email, 'password123');
    return { user, accessToken: login.json().accessToken };
  }

  async function createStudentUser() {
    const user = await createTestUser({ role: 'STUDENT' });
    const login = await loginAs(user.email, 'password123');
    return { user, accessToken: login.json().accessToken };
  }

  function futureIso(days: number) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  function pastIso(days: number) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  async function createCoupon(adminToken: string, overrides: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/coupons',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        code: `SAVE${Math.floor(Math.random() * 100000)}`,
        type: 'PERCENT',
        value: 10,
        validFrom: pastIso(1),
        validTo: futureIso(30),
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  describe('Admin coupon CRUD', () => {
    it('creates a coupon (super admin only)', async () => {
      const admin = await createSuperAdmin();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/coupons',
        headers: { authorization: `Bearer ${admin.accessToken}` },
        payload: {
          code: 'welcome10',
          type: 'PERCENT',
          value: 10,
          validFrom: pastIso(1),
          validTo: futureIso(30),
        },
      });
      expect(res.statusCode).toBe(201);
      const coupon = await prisma.coupon.findUnique({ where: { id: res.json().id } });
      expect(coupon?.code).toBe('WELCOME10');
    });

    it('rejects non-super-admins', async () => {
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/coupons',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: {
          code: 'X',
          type: 'PERCENT',
          value: 10,
          validFrom: futureIso(1),
          validTo: futureIso(30),
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects a duplicate code', async () => {
      const admin = await createSuperAdmin();
      await createCoupon(admin.accessToken, { code: 'DUP' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/coupons',
        headers: { authorization: `Bearer ${admin.accessToken}` },
        payload: {
          code: 'dup',
          type: 'PERCENT',
          value: 20,
          validFrom: pastIso(1),
          validTo: futureIso(30),
        },
      });
      expect(res.statusCode).toBe(409);
    });

    it('rejects PERCENT value above 100', async () => {
      const admin = await createSuperAdmin();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/coupons',
        headers: { authorization: `Bearer ${admin.accessToken}` },
        payload: {
          code: 'BAD',
          type: 'PERCENT',
          value: 150,
          validFrom: pastIso(1),
          validTo: futureIso(30),
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('lists coupons with usage counts', async () => {
      const admin = await createSuperAdmin();
      await createCoupon(admin.accessToken);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/coupons',
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(1);
      expect(res.json().items[0]._count.usages).toBe(0);
    });

    it('updates a coupon', async () => {
      const admin = await createSuperAdmin();
      const coupon = await createCoupon(admin.accessToken);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/coupons/${coupon.id}`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
        payload: { value: 25 },
      });
      expect(res.statusCode).toBe(200);
      const updated = await prisma.coupon.findUnique({ where: { id: coupon.id } });
      expect(Number(updated?.value)).toBe(25);
    });

    it('deletes a coupon', async () => {
      const admin = await createSuperAdmin();
      const coupon = await createCoupon(admin.accessToken);
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/coupons/${coupon.id}`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(204);
      const gone = await prisma.coupon.findUnique({ where: { id: coupon.id } });
      expect(gone).toBeNull();
    });
  });

  describe('GET /coupons/:code/validate', () => {
    it('returns the discount for a valid coupon', async () => {
      const admin = await createSuperAdmin();
      const coupon = await createCoupon(admin.accessToken, { code: 'VALID10' });
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/coupons/${coupon.id}/validate`,
      });
      expect(res.statusCode).toBe(404);

      const res2 = await app.inject({
        method: 'GET',
        url: '/api/v1/coupons/VALID10/validate?applicableTo=TRIP&amount=10000',
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.json().discountAmount).toBe(1000);
      expect(res2.json().finalAmount).toBe(9000);
    });

    it('rejects expired coupons', async () => {
      await createCoupon(await (await createSuperAdmin()).accessToken, {
        code: 'EXPIRED',
        validFrom: pastIso(5),
        validTo: pastIso(1),
      });
      const res = await app.inject({ method: 'GET', url: '/api/v1/coupons/EXPIRED/validate' });
      expect(res.statusCode).toBe(409);
    });

    it('rejects when min spend is not met', async () => {
      const admin = await createSuperAdmin();
      await createCoupon(admin.accessToken, { code: 'MINSPEND', minSpend: 5000 });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/coupons/MINSPEND/validate?amount=1000',
      });
      expect(res.statusCode).toBe(409);
    });

    it('rejects a FOOD coupon validated for a TRIP purchase', async () => {
      const admin = await createSuperAdmin();
      await createCoupon(admin.accessToken, {
        code: 'FOODONLY',
        applicableTo: 'FOOD',
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/coupons/FOODONLY/validate?applicableTo=TRIP&amount=10000',
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('Coupon redemption on bookings', () => {
    async function setupTrip(operatorId: string) {
      const route = await prisma.route.create({
        data: { fromCity: 'Lilongwe', toCity: 'Blantyre', basePrice: 15000 },
      });
      const bus = await prisma.bus.create({
        data: {
          operatorId,
          name: 'Coach',
          plateNumber: `PL-${Math.random().toString(36).slice(2, 8)}`,
          capacity: 4,
        },
      });
      const trip = await busService.createTrip(operatorId, {
        routeId: route.id,
        busId: bus.id,
        departureTime: futureIso(5),
        arrivalTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 4 * 3600 * 1000).toISOString(),
        price: 10000,
      });
      return prisma.trip.findUnique({ where: { id: trip.id } });
    }

    it('applies a PERCENT coupon and records usage', async () => {
      const admin = await createSuperAdmin();
      await createCoupon(admin.accessToken, { code: 'TRIP10', value: 10 });
      const operator = await createTestUser({ role: 'OPERATOR' });
      const student = await createStudentUser();
      const trip = await setupTrip(
        (await prisma.operatorProfile.findUnique({ where: { userId: operator.id } }))!.id,
      );
      const seat = await prisma.seatInventory.findFirst({ where: { tripId: trip!.id } });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: {
          tripId: trip!.id,
          seatNumber: seat!.seatNumber,
          passengerName: 'Student',
          passengerPhone: '+265991111222',
          couponCode: 'trip10',
        },
      });
      expect(res.statusCode).toBe(201);

      const booking = await prisma.booking.findUnique({ where: { id: res.json().id } });
      expect(Number(booking?.totalAmount)).toBe(9000);
      expect(booking?.couponCode).toBe('TRIP10');
      expect(Number(booking?.discountAmount)).toBe(1000);

      const usage = await prisma.couponUsage.findFirst({
        where: { couponId: (await prisma.coupon.findUnique({ where: { code: 'TRIP10' } }))!.id },
      });
      expect(usage?.contextType).toBe('booking');
      expect(Number(usage?.discountAmount)).toBe(1000);
    });

    it('applies a FIXED coupon capped at the amount', async () => {
      const admin = await createSuperAdmin();
      await createCoupon(admin.accessToken, { code: 'FIX', type: 'FIXED', value: 20000 });
      const operator = await createTestUser({ role: 'OPERATOR' });
      const student = await createStudentUser();
      const trip = await setupTrip(
        (await prisma.operatorProfile.findUnique({ where: { userId: operator.id } }))!.id,
      );
      const seat = await prisma.seatInventory.findFirst({ where: { tripId: trip!.id } });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: {
          tripId: trip!.id,
          seatNumber: seat!.seatNumber,
          passengerName: 'Student',
          passengerPhone: '+265991111222',
          couponCode: 'FIX',
        },
      });
      expect(res.statusCode).toBe(201);
      const booking = await prisma.booking.findUnique({ where: { id: res.json().id } });
      expect(Number(booking?.totalAmount)).toBe(0);
    });

    it('rejects a FOOD-only coupon on a trip booking', async () => {
      const admin = await createSuperAdmin();
      await createCoupon(admin.accessToken, { code: 'ONLYFOOD', applicableTo: 'FOOD' });
      const operator = await createTestUser({ role: 'OPERATOR' });
      const student = await createStudentUser();
      const trip = await setupTrip(
        (await prisma.operatorProfile.findUnique({ where: { userId: operator.id } }))!.id,
      );
      const seat = await prisma.seatInventory.findFirst({ where: { tripId: trip!.id } });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: {
          tripId: trip!.id,
          seatNumber: seat!.seatNumber,
          passengerName: 'Student',
          passengerPhone: '+265991111222',
          couponCode: 'ONLYFOOD',
        },
      });
      expect(res.statusCode).toBe(409);
    });

    it('rejects reusing a coupon beyond per-user cap', async () => {
      const admin = await createSuperAdmin();
      await createCoupon(admin.accessToken, { code: 'ONCE', perUserUses: 1 });
      const operator = await createTestUser({ role: 'OPERATOR' });
      const student = await createStudentUser();
      const trip = await setupTrip(
        (await prisma.operatorProfile.findUnique({ where: { userId: operator.id } }))!.id,
      );

      for (let i = 0; i < 2; i++) {
        const seatRow = await prisma.seatInventory.findFirst({
          where: { tripId: trip!.id, status: 'AVAILABLE' },
        });
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/bookings',
          headers: { authorization: `Bearer ${student.accessToken}` },
          payload: {
            tripId: trip!.id,
            seatNumber: seatRow!.seatNumber,
            passengerName: 'Student',
            passengerPhone: `+26599111122${i}`,
            couponCode: 'ONCE',
          },
        });
        if (i === 0) expect(res.statusCode).toBe(201);
        else expect(res.statusCode).toBe(409);
      }
    });
  });
});
