import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma.js';
import { createUser } from './auth.service.js';
import { createHash } from 'node:crypto';

describe('auth module', () => {
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
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createTestUser(overrides: Partial<Parameters<typeof createUser>[0]> = {}) {
    return createUser(
      {
        email: 'student@foodiebus.mw',
        phone: '+265991234567',
        password: 'password123',
        fullName: 'Test Student',
        role: 'STUDENT',
        ...overrides,
      },
      'SUPER_ADMIN',
    );
  }

  async function loginAs(email: string, password: string) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: email, password },
    });
  }

  describe('POST /auth/login', () => {
    it('returns tokens on valid login with email', async () => {
      await createTestUser();
      const res = await loginAs('student@foodiebus.mw', 'password123');
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accessToken).toBeTypeOf('string');
      expect(body.refreshToken).toBeTypeOf('string');
    });

    it('logs in with phone number', async () => {
      await createTestUser();
      const res = await loginAs('+265991234567', 'password123');
      expect(res.statusCode).toBe(200);
    });

    it('rejects invalid credentials', async () => {
      await createTestUser();
      const res = await loginAs('student@foodiebus.mw', 'wrongpassword');
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('rejects login for unknown email', async () => {
      const res = await loginAs('nobody@foodiebus.mw', 'password123');
      expect(res.statusCode).toBe(401);
    });

    it('rejects login for deactivated user', async () => {
      const user = await createTestUser();
      await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
      const res = await loginAs('student@foodiebus.mw', 'password123');
      expect(res.statusCode).toBe(401);
    });

    it('writes an audit log entry on login', async () => {
      await createTestUser();
      await loginAs('student@foodiebus.mw', 'password123');
      const log = await prisma.auditLog.findFirst({ where: { action: 'auth.login' } });
      expect(log).not.toBeNull();
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token on use', async () => {
      await createTestUser();
      const login = await loginAs('student@foodiebus.mw', 'password123');
      const { refreshToken } = login.json();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.refreshToken).not.toBe(refreshToken);

      // Old token is now revoked
      const old = await prisma.refreshToken.findFirst({
        where: {
          tokenHash: createHash('sha256').update(refreshToken).digest('hex'),
        },
      });
      expect(old?.revokedAt).not.toBeNull();
    });

    it('rejects an invalid refresh token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: 'not-a-real-token' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects reuse of a rotated refresh token', async () => {
      await createTestUser();
      const login = await loginAs('student@foodiebus.mw', 'password123');
      const { refreshToken } = login.json();

      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });

      // Reusing the old (now revoked) token should be rejected
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the refresh token', async () => {
      await createTestUser();
      const login = await loginAs('student@foodiebus.mw', 'password123');
      const { refreshToken } = login.json();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        payload: { refreshToken },
      });
      expect(res.statusCode).toBe(204);

      // Refresh with revoked token fails
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });
      expect(refreshRes.statusCode).toBe(401);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the current user with a valid token', async () => {
      const user = await createTestUser();
      const login = await loginAs('student@foodiebus.mw', 'password123');
      const { accessToken } = login.json();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(user.id);
      expect(body.email).toBe('student@foodiebus.mw');
      expect(body.role).toBe('STUDENT');
    });

    it('rejects a request with no token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
      expect(res.statusCode).toBe(401);
    });

    it('rejects a request with an invalid token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: 'Bearer garbage' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /users (admin only)', () => {
    it('allows super admin to create a user', async () => {
      const _admin = await createTestUser({ role: 'SUPER_ADMIN', email: 'admin@foodiebus.mw' });
      const login = await loginAs('admin@foodiebus.mw', 'password123');
      const { accessToken } = login.json();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          email: 'vendor@foodiebus.mw',
          phone: '+265991111222',
          password: 'vendorpass123',
          fullName: 'Vendor One',
          role: 'VENDOR',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeTypeOf('string');

      const created = await prisma.user.findUnique({ where: { id: body.id } });
      expect(created?.role).toBe('VENDOR');
    });

    it('forbids a student from creating users', async () => {
      await createTestUser();
      const login = await loginAs('student@foodiebus.mw', 'password123');
      const { accessToken } = login.json();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          email: 'x@foodiebus.mw',
          phone: '+265991000000',
          password: 'password123',
          fullName: 'X',
          role: 'STUDENT',
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 409 when the email is already taken', async () => {
      await createTestUser({
        role: 'SUPER_ADMIN',
        email: 'admin@foodiebus.mw',
        phone: '+265991888000',
      });
      await createTestUser({ email: 'dup@foodiebus.mw', phone: '+265991888001' });
      const login = await loginAs('admin@foodiebus.mw', 'password123');
      const { accessToken } = login.json();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          email: 'dup@foodiebus.mw',
          phone: '+265991999999',
          password: 'password123',
          fullName: 'Duplicate',
          role: 'STUDENT',
        },
      });
      expect(res.statusCode).toBe(409);
    });

    it('returns 409 when the phone is already taken', async () => {
      await createTestUser({
        role: 'SUPER_ADMIN',
        email: 'admin@foodiebus.mw',
        phone: '+265991888002',
      });
      await createTestUser({ email: 'phone-owner@foodiebus.mw', phone: '+265991777001' });
      const login = await loginAs('admin@foodiebus.mw', 'password123');
      const { accessToken } = login.json();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          email: 'someone-else@foodiebus.mw',
          phone: '+265991777001',
          password: 'password123',
          fullName: 'Duplicate',
          role: 'STUDENT',
        },
      });
      expect(res.statusCode).toBe(409);
    });

    it('rejects a request with no token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        payload: {
          email: 'x@foodiebus.mw',
          phone: '+265991000000',
          password: 'password123',
          fullName: 'X',
          role: 'STUDENT',
        },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('PATCH /users/:id (super admin only)', () => {
    it('allows super admin to change a role', async () => {
      const _admin = await createTestUser({ role: 'SUPER_ADMIN', email: 'admin@foodiebus.mw' });
      const target = await createTestUser({ email: 'target@foodiebus.mw', phone: '+265991555666' });
      const login = await loginAs('admin@foodiebus.mw', 'password123');
      const { accessToken } = login.json();

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${target.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { role: 'OPERATOR' },
      });
      expect(res.statusCode).toBe(200);

      const updated = await prisma.user.findUnique({ where: { id: target.id } });
      expect(updated?.role).toBe('OPERATOR');
    });

    it('forbids a non-super-admin from changing a role', async () => {
      await createTestUser({ role: 'ADMIN', email: 'admin2@foodiebus.mw' });
      const target = await createTestUser({
        email: 'target2@foodiebus.mw',
        phone: '+265991777888',
      });
      const login = await loginAs('admin2@foodiebus.mw', 'password123');
      const { accessToken } = login.json();

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${target.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { role: 'FINANCIAL' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /users (pagination)', () => {
    it('lists users with pagination metadata', async () => {
      const _admin = await createTestUser({ role: 'SUPER_ADMIN', email: 'admin3@foodiebus.mw' });
      await createTestUser({ email: 'u1@foodiebus.mw', phone: '+265991123001' });
      await createTestUser({ email: 'u2@foodiebus.mw', phone: '+265991123002' });
      const login = await loginAs('admin3@foodiebus.mw', 'password123');
      const { accessToken } = login.json();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users?page=1&limit=2',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(2);
      expect(body.total).toBeGreaterThanOrEqual(3);
    });
  });
});
