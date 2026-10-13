import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma.js';
import { createUser } from '../auth/auth.service.js';

vi.mock('../payments/paychangu.js', () => ({
  paychangu: {
    initiate: vi.fn(),
    verify: vi.fn(),
    refund: vi.fn(),
  },
}));

import { paychangu } from '../payments/paychangu.js';

const mockedInitiate = vi.mocked(paychangu.initiate);
const mockedVerify = vi.mocked(paychangu.verify);

describe('promotions module (dish boost)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    mockedInitiate.mockReset();
    mockedVerify.mockReset();
    mockedInitiate.mockResolvedValue({
      checkoutUrl: 'https://checkout.test/promo',
      txRef: 'PROMO-test',
    });
    mockedVerify.mockResolvedValue({ status: 'success', amount: 0, currency: 'MWK' });
    await prisma.promotion.deleteMany();
    await prisma.dish.deleteMany();
    await prisma.vendorOperatingHours.deleteMany();
    await prisma.vendorProfile.deleteMany();
    await prisma.foodCategory.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createTestUser(overrides: Partial<Parameters<typeof createUser>[0]> = {}) {
    const email = `promo-${Math.random().toString(36).slice(2)}@foodiebus.mw`;
    const phone = `+26599${String(Math.floor(1000000 + Math.random() * 9000000))}`;
    const user = await createUser(
      {
        email,
        phone,
        password: 'password123',
        fullName: 'Promo Vendor',
        role: 'VENDOR',
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

  async function vendorWithDish() {
    const user = await createTestUser();
    const login = await loginAs(user.email, 'password123');
    const token = login.json().accessToken as string;
    const vendor = await prisma.vendorProfile.findUnique({ where: { userId: user.id } });
    const category = await prisma.foodCategory.create({
      data: {
        name: `Cat-${Math.random().toString(36).slice(2)}`,
        slug: `cat-${Math.random().toString(36).slice(2)}`,
      },
    });
    const dish = await prisma.dish.create({
      data: { vendorId: vendor!.id, categoryId: category.id, name: 'Boost Burger', price: 5000 },
    });
    return { token, vendor: vendor!, dish };
  }

  it('quotes days × daily rate', async () => {
    const { token, dish } = await vendorWithDish();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/promotions/quote',
      headers: { authorization: `Bearer ${token}` },
      payload: { dishId: dish.id, days: 7 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().days).toBe(7);
    expect(res.json().amountMWK).toBe(res.json().dailyRate * 7);
  });

  it('creates a promotion then pays then verifies it live', async () => {
    const { token, dish } = await vendorWithDish();
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/promotions',
      headers: { authorization: `Bearer ${token}` },
      payload: { dishId: dish.id, headline: 'Weekend deal', days: 3 },
    });
    expect(created.statusCode).toBe(201);
    const promoId = created.json().id as string;

    // Drop-in: no server redirect — returns popup params with reserved txRef.
    const paid = await app.inject({
      method: 'POST',
      url: `/api/v1/promotions/${promoId}/pay`,
      headers: { authorization: `Bearer ${token}` },
      payload: { returnUrl: 'http://localhost:5173/vendor/promotions' },
    });
    expect(paid.statusCode).toBe(201);
    expect(paid.json().txRef).toMatch(/^PROMO-/);
    expect(paid.json().publicKey).toBe('test_paychangu_public_key');
    expect(paid.json().amountMWK).toBeTruthy();
    expect(paid.json().returnUrl).toBe('http://localhost:5173/vendor/promotions');
    const stored = await prisma.promotion.findUnique({ where: { id: promoId } });
    expect(stored?.txRef).toBe(paid.json().txRef);

    const promo = await prisma.promotion.findUnique({ where: { id: promoId } });
    mockedVerify.mockResolvedValueOnce({
      status: 'success',
      amount: Number(promo!.amountMWK),
      currency: 'MWK',
    });
    const verified = await app.inject({
      method: 'POST',
      url: `/api/v1/promotions/${promoId}/verify`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(verified.statusCode).toBe(200);
    expect(['ACTIVE', 'SCHEDULED']).toContain(verified.json().status);
  });

  it('rejects a bad returnUrl on /pay', async () => {
    const { token, dish } = await vendorWithDish();
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/promotions',
      headers: { authorization: `Bearer ${token}` },
      payload: { dishId: dish.id, headline: 'Bad url', days: 2 },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/promotions/${created.json().id}/pay`,
      headers: { authorization: `Bearer ${token}` },
      payload: { returnUrl: 'javascript:alert(1)' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a second live promotion on the same dish (no double billing)', async () => {
    const { token, dish } = await vendorWithDish();
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/promotions',
      headers: { authorization: `Bearer ${token}` },
      payload: { dishId: dish.id, headline: 'First', days: 3 },
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/promotions',
      headers: { authorization: `Bearer ${token}` },
      payload: { dishId: dish.id, headline: 'Second', days: 3 },
    });
    expect(second.statusCode).toBe(409);
  });

  it('forbids promoting another vendor dish', async () => {
    const a = await vendorWithDish();
    const b = await vendorWithDish();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/promotions',
      headers: { authorization: `Bearer ${b.token}` },
      payload: { dishId: a.dish.id, headline: 'Hijack', days: 2 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('public feed only shows live promos with dish + vendor + validity', async () => {
    const { vendor, dish } = await vendorWithDish();
    const now = new Date();
    await prisma.promotion.create({
      data: {
        vendorId: vendor.id,
        dishId: dish.id,
        headline: 'Live deal',
        description: 'Tasty words',
        days: 5,
        amountMWK: 10000,
        startsAt: new Date(now.getTime() - 1000),
        endsAt: new Date(now.getTime() + 5 * 86_400_000),
        status: 'ACTIVE',
      },
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/promotions/active' });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBe(1);
    const card = res.json().items[0];
    expect(card.dish.name).toBe('Boost Burger');
    expect(card.vendor.businessName).toBeTruthy();
    expect(card.headline).toBe('Live deal');
    expect(card.endsAt).toBeTruthy();
    expect(card.daysLeft).toBeGreaterThan(0);
  });

  it('accepts empty-string logo/banner and string lat/lng on profile save (no spinner 400)', async () => {
    const { token } = await vendorWithDish();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/vendors/me/profile',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        businessName: 'Kept Name',
        logoUrl: '',
        bannerUrl: '',
        phone: '',
        latitude: '-13.9626',
        longitude: '33.7741',
      },
    });
    expect(res.statusCode).toBe(200);
  });
});
