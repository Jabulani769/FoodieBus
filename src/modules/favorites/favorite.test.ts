import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma.js';
import { createUser } from '../auth/auth.service.js';

describe('favorites module', () => {
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

  async function createStudentUser() {
    const user = await createTestUser({ role: 'STUDENT' });
    const login = await loginAs(user.email, 'password123');
    return { user, accessToken: login.json().accessToken };
  }

  async function createVendor() {
    const user = await createTestUser({ role: 'VENDOR' });
    return prisma.vendorProfile.findUnique({ where: { userId: user.id } });
  }

  async function createCategory() {
    return prisma.foodCategory.create({
      data: {
        name: `Cat-${Math.random().toString(36).slice(2)}`,
        slug: `cat-${Math.random().toString(36).slice(2)}`,
      },
    });
  }

  async function createDish(vendorId: string) {
    const cat = await createCategory();
    return prisma.dish.create({
      data: {
        vendorId,
        categoryId: cat.id,
        name: `Dish-${Math.random().toString(36).slice(2)}`,
        price: 5000,
      },
    });
  }

  describe('POST /favorites', () => {
    it('adds a favorite dish', async () => {
      const student = await createStudentUser();
      const vendor = await createVendor();
      const dish = await createDish(vendor!.id);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { dishId: dish.id },
      });
      expect(res.statusCode).toBe(201);
      const fav = await prisma.favorite.findUnique({ where: { id: res.json().id } });
      expect(fav?.dishId).toBe(dish.id);
    });

    it('rejects a favorite with neither dish nor vendor', async () => {
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects duplicate favorites', async () => {
      const student = await createStudentUser();
      const vendor = await createVendor();
      const dish = await createDish(vendor!.id);
      await app.inject({
        method: 'POST',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { dishId: dish.id },
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { dishId: dish.id },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('GET /favorites', () => {
    it('lists only own favorites with joined details', async () => {
      const student = await createStudentUser();
      const other = await createStudentUser();
      const vendor = await createVendor();
      const dish = await createDish(vendor!.id);
      await app.inject({
        method: 'POST',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { vendorId: vendor!.id },
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${other.accessToken}` },
        payload: { dishId: dish.id },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBe(1);
      expect(res.json().items[0].vendor.businessName).toBeTruthy();
    });

    it('requires authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/favorites' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /favorites/top', () => {
    it('returns most-favorited dishes and vendors', async () => {
      const student = await createStudentUser();
      const vendor = await createVendor();
      const dish = await createDish(vendor!.id);
      for (let i = 0; i < 3; i++) {
        const u = await createStudentUser();
        await app.inject({
          method: 'POST',
          url: '/api/v1/favorites',
          headers: { authorization: `Bearer ${u.accessToken}` },
          payload: { dishId: dish.id },
        });
      }
      await app.inject({
        method: 'POST',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { vendorId: vendor!.id },
      });

      const res = await app.inject({ method: 'GET', url: '/api/v1/favorites/top' });
      expect(res.statusCode).toBe(200);
      expect(res.json().topDishes[0].id).toBe(dish.id);
      expect(res.json().topDishes[0].favoriteCount).toBe(3);
      expect(res.json().topVendors[0].favoriteCount).toBe(1);
    });
  });

  describe('DELETE /favorites/:id', () => {
    it('removes own favorite', async () => {
      const student = await createStudentUser();
      const vendor = await createVendor();
      await app.inject({
        method: 'POST',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { vendorId: vendor!.id },
      });
      const fav = await prisma.favorite.findFirst({ where: { userId: student.user.id } });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/favorites/${fav!.id}`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(204);
      const gone = await prisma.favorite.findUnique({ where: { id: fav!.id } });
      expect(gone).toBeNull();
    });

    it('forbids removing another user favorite', async () => {
      const studentA = await createStudentUser();
      const studentB = await createStudentUser();
      const vendor = await createVendor();
      await app.inject({
        method: 'POST',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${studentA.accessToken}` },
        payload: { vendorId: vendor!.id },
      });
      const fav = await prisma.favorite.findFirst({ where: { userId: studentA.user.id } });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/favorites/${fav!.id}`,
        headers: { authorization: `Bearer ${studentB.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
