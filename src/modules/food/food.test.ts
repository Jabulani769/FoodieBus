import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma.js';
import { createUser } from '../auth/auth.service.js';

describe('food module', () => {
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

  async function createVendorUser(name = 'Test Vendor') {
    const user = await createTestUser({
      fullName: name,
      role: 'VENDOR',
    });
    const login = await loginAs(user.email, 'password123');
    return {
      user,
      email: user.email,
      phone: user.phone,
      accessToken: login.json().accessToken,
      vendorProfile: await prisma.vendorProfile.findUnique({ where: { userId: user.id } }),
    };
  }

  async function createAdminUser() {
    const user = await createTestUser({ role: 'SUPER_ADMIN' });
    const login = await loginAs(user.email, 'password123');
    return login.json().accessToken;
  }

  async function createCategory(overrides: { name?: string; slug?: string } = {}) {
    const name = overrides.name ?? `Category-${Math.random().toString(36).slice(2)}`;
    const slug = overrides.slug ?? `cat-${Math.random().toString(36).slice(2)}`;
    return prisma.foodCategory.create({ data: { name, slug } });
  }

  describe('Categories', () => {
    it('GET /categories returns active categories', async () => {
      await createCategory();
      const res = await app.inject({ method: 'GET', url: '/api/v1/categories' });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().items)).toBe(true);
      expect(res.json().items.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /categories allows super admin', async () => {
      const token = await createAdminUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/categories',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Rice Dishes', slug: 'rice-dishes' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBeTypeOf('string');
    });

    it('POST /categories forbids a vendor', async () => {
      const vendor = await createVendorUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/categories',
        headers: { authorization: `Bearer ${vendor.accessToken}` },
        payload: { name: 'Burgers', slug: 'burgers' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /categories rejects an unauthenticated request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/categories',
        payload: { name: 'Burgers', slug: 'burgers' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /categories rejects a duplicate slug with 409', async () => {
      const token = await createAdminUser();
      await createCategory({ slug: 'dup-slug' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/categories',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Duplicate', slug: 'dup-slug' },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
    });

    it('DELETE /categories/:id allows super admin', async () => {
      const token = await createAdminUser();
      const cat = await createCategory();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/categories/${cat.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(204);
      expect(await prisma.foodCategory.findUnique({ where: { id: cat.id } })).toBeNull();
    });

    it('DELETE /categories/:id forbids a non-super admin', async () => {
      const admin = await createTestUser({ role: 'ADMIN' });
      const login = await loginAs(admin.email, 'password123');
      const cat = await createCategory();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/categories/${cat.id}`,
        headers: { authorization: `Bearer ${login.json().accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE /categories/:id returns 404 for non-existent category', async () => {
      const token = await createAdminUser();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/categories/${crypto.randomUUID()}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Vendors', () => {
    it('GET /vendors lists active vendors with pagination', async () => {
      await createVendorUser('Vendor A');
      await createVendorUser('Vendor B');
      const res = await app.inject({ method: 'GET', url: '/api/v1/vendors?page=1&limit=2' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.page).toBe(1);
      expect(body.total).toBeGreaterThanOrEqual(2);
    });

    it('GET /vendors/:id returns a vendor', async () => {
      const vendor = await createVendorUser();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/vendors/${vendor.vendorProfile?.id}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().businessName).toBe('Test Vendor');
    });

    it('GET /vendors/:id returns 404 for non-existent vendor', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/vendors/${crypto.randomUUID()}`,
      });
      expect(res.statusCode).toBe(404);
    });

    it('GET /vendors/me/profile returns own profile', async () => {
      const vendor = await createVendorUser();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/vendors/me/profile',
        headers: { authorization: `Bearer ${vendor.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(vendor.vendorProfile?.id);
    });

    it('PATCH /vendors/me/profile updates own profile', async () => {
      const vendor = await createVendorUser();
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/vendors/me/profile',
        headers: { authorization: `Bearer ${vendor.accessToken}` },
        payload: { businessName: 'New Business Name', description: 'We sell good food' },
      });
      expect(res.statusCode).toBe(200);
      const updated = await prisma.vendorProfile.findUnique({
        where: { id: vendor.vendorProfile?.id },
      });
      expect(updated?.businessName).toBe('New Business Name');
      expect(updated?.description).toBe('We sell good food');
    });

    it('PATCH /vendors/me/profile forbids a student', async () => {
      const student = await createTestUser();
      const login = await loginAs(student.email, 'password123');
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/vendors/me/profile',
        headers: { authorization: `Bearer ${login.json().accessToken}` },
        payload: { businessName: 'Hacked' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Dishes', () => {
    it('auto-creates a vendor profile when a user gets the VENDOR role', async () => {
      const user = await createTestUser({ role: 'VENDOR' });
      const profile = await prisma.vendorProfile.findUnique({ where: { userId: user.id } });
      expect(profile).not.toBeNull();
      expect(profile?.businessName).toBe('Test User');
    });

    it('POST /dishes creates a dish on own vendor profile', async () => {
      const vendor = await createVendorUser();
      const cat = await createCategory();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/dishes',
        headers: { authorization: `Bearer ${vendor.accessToken}` },
        payload: { categoryId: cat.id, name: 'Chicken Rice', price: 4500 },
      });
      expect(res.statusCode).toBe(201);
      const dish = await prisma.dish.findUnique({ where: { id: res.json().id } });
      expect(dish?.name).toBe('Chicken Rice');
      expect(dish?.vendorId).toBe(vendor.vendorProfile?.id);
    });

    it('POST /dishes forbids a student', async () => {
      const student = await createTestUser();
      const login = await loginAs(student.email, 'password123');
      const cat = await createCategory();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/dishes',
        headers: { authorization: `Bearer ${login.json().accessToken}` },
        payload: { categoryId: cat.id, name: 'X', price: 100 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /dishes returns 404 for a non-existent category', async () => {
      const vendor = await createVendorUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/dishes',
        headers: { authorization: `Bearer ${vendor.accessToken}` },
        payload: { categoryId: crypto.randomUUID(), name: 'X', price: 100 },
      });
      expect(res.statusCode).toBe(404);
    });

    it('GET /vendors/:vendorId/dishes lists a vendor dishes', async () => {
      const vendor = await createVendorUser();
      const cat = await createCategory();
      await prisma.dish.create({
        data: { vendorId: vendor.vendorProfile!.id, categoryId: cat.id, name: 'Rice', price: 2000 },
      });
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/vendors/${vendor.vendorProfile?.id}/dishes`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(1);
      expect(res.json().items[0].name).toBe('Rice');
    });

    it('GET /vendors/:vendorId/dishes filters by isAvailable', async () => {
      const vendor = await createVendorUser();
      const cat = await createCategory();
      await prisma.dish.createMany({
        data: [
          {
            vendorId: vendor.vendorProfile!.id,
            categoryId: cat.id,
            name: 'A',
            price: 1000,
            isAvailable: true,
          },
          {
            vendorId: vendor.vendorProfile!.id,
            categoryId: cat.id,
            name: 'B',
            price: 1000,
            isAvailable: false,
          },
        ],
      });
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/vendors/${vendor.vendorProfile?.id}/dishes?isAvailable=true`,
      });
      expect(res.json().items.length).toBe(1);
      expect(res.json().items[0].name).toBe('A');
    });

    it('GET /dishes/:id returns a dish with vendor and category', async () => {
      const vendor = await createVendorUser();
      const cat = await createCategory();
      const dish = await prisma.dish.create({
        data: { vendorId: vendor.vendorProfile!.id, categoryId: cat.id, name: 'Rice', price: 2000 },
      });
      const res = await app.inject({ method: 'GET', url: `/api/v1/dishes/${dish.id}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().vendor.businessName).toBe('Test Vendor');
      expect(res.json().category.name).toBe(cat.name);
    });

    it('GET /dishes/:id returns 404 for non-existent dish', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/dishes/${crypto.randomUUID()}` });
      expect(res.statusCode).toBe(404);
    });

    it('PATCH /dishes/:id updates an own dish', async () => {
      const vendor = await createVendorUser();
      const cat = await createCategory();
      const dish = await prisma.dish.create({
        data: { vendorId: vendor.vendorProfile!.id, categoryId: cat.id, name: 'Rice', price: 2000 },
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/dishes/${dish.id}`,
        headers: { authorization: `Bearer ${vendor.accessToken}` },
        payload: { price: 2500 },
      });
      expect(res.statusCode).toBe(200);
      const updated = await prisma.dish.findUnique({ where: { id: dish.id } });
      expect(updated?.price.toString()).toBe('2500');
    });

    it('PATCH /dishes/:id forbids updating another vendor dish', async () => {
      const vendorA = await createVendorUser('Vendor A');
      const vendorB = await createVendorUser('Vendor B');
      const cat = await createCategory();
      const dish = await prisma.dish.create({
        data: {
          vendorId: vendorA.vendorProfile!.id,
          categoryId: cat.id,
          name: 'Rice',
          price: 2000,
        },
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/dishes/${dish.id}`,
        headers: { authorization: `Bearer ${vendorB.accessToken}` },
        payload: { price: 9999 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('PATCH /dishes/:id/availability toggles isAvailable', async () => {
      const vendor = await createVendorUser();
      const cat = await createCategory();
      const dish = await prisma.dish.create({
        data: { vendorId: vendor.vendorProfile!.id, categoryId: cat.id, name: 'Rice', price: 2000 },
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/dishes/${dish.id}/availability`,
        headers: { authorization: `Bearer ${vendor.accessToken}` },
        payload: { isAvailable: false },
      });
      expect(res.statusCode).toBe(200);
      const updated = await prisma.dish.findUnique({ where: { id: dish.id } });
      expect(updated?.isAvailable).toBe(false);
    });

    it('PATCH /dishes/:id/availability sets a time window', async () => {
      const vendor = await createVendorUser();
      const cat = await createCategory();
      const dish = await prisma.dish.create({
        data: { vendorId: vendor.vendorProfile!.id, categoryId: cat.id, name: 'Rice', price: 2000 },
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/dishes/${dish.id}/availability`,
        headers: { authorization: `Bearer ${vendor.accessToken}` },
        payload: {
          isAvailable: true,
          availableFrom: '2026-08-14T08:00:00+02:00',
          availableTo: '2026-08-14T12:00:00+02:00',
        },
      });
      expect(res.statusCode).toBe(200);
      const updated = await prisma.dish.findUnique({ where: { id: dish.id } });
      expect(updated?.availableFrom).not.toBeNull();
      expect(updated?.availableTo).not.toBeNull();
    });

    it('DELETE /dishes/:id allows the owning vendor', async () => {
      const vendor = await createVendorUser();
      const cat = await createCategory();
      const dish = await prisma.dish.create({
        data: { vendorId: vendor.vendorProfile!.id, categoryId: cat.id, name: 'Rice', price: 2000 },
      });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/dishes/${dish.id}`,
        headers: { authorization: `Bearer ${vendor.accessToken}` },
      });
      expect(res.statusCode).toBe(204);
      expect(await prisma.dish.findUnique({ where: { id: dish.id } })).toBeNull();
    });

    it('DELETE /dishes/:id forbids another vendor', async () => {
      const vendorA = await createVendorUser('Vendor A');
      const vendorB = await createVendorUser('Vendor B');
      const cat = await createCategory();
      const dish = await prisma.dish.create({
        data: {
          vendorId: vendorA.vendorProfile!.id,
          categoryId: cat.id,
          name: 'Rice',
          price: 2000,
        },
      });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/dishes/${dish.id}`,
        headers: { authorization: `Bearer ${vendorB.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE /dishes/:id allows super admin', async () => {
      const vendor = await createVendorUser();
      const token = await createAdminUser();
      const cat = await createCategory();
      const dish = await prisma.dish.create({
        data: { vendorId: vendor.vendorProfile!.id, categoryId: cat.id, name: 'Rice', price: 2000 },
      });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/dishes/${dish.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(204);
    });
  });
});
