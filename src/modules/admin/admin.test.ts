import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma.js';
import { createUser } from '../auth/auth.service.js';

describe('admin module', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.platformSetting.deleteMany();
    await prisma.notificationPreference.deleteMany();
    await prisma.otpCode.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.seatInventory.deleteMany();
    await prisma.trip.deleteMany();
    await prisma.route.deleteMany();
    await prisma.bus.deleteMany();
    await prisma.operatorProfile.deleteMany();
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

  async function adminUser() {
    const admin = await createTestUser({ fullName: 'Admin One', role: 'ADMIN' });
    const login = await loginAs(admin.email, 'password123');
    return { user: admin, email: admin.email, accessToken: login.json().accessToken };
  }

  async function superAdminUser() {
    const admin = await createTestUser({ fullName: 'Super One', role: 'SUPER_ADMIN' });
    const login = await loginAs(admin.email, 'password123');
    return { user: admin, email: admin.email, accessToken: login.json().accessToken };
  }

  async function studentUser(name = 'Jane Student') {
    const student = await createTestUser({ fullName: name, role: 'STUDENT' });
    const login = await loginAs(student.email, 'password123');
    return { user: student, email: student.email, accessToken: login.json().accessToken };
  }

  describe('Dashboard', () => {
    it('GET /admin/dashboard returns aggregate counts', async () => {
      const admin = await adminUser();
      const operator = await createTestUser({ fullName: 'Op Co', role: 'OPERATOR' });
      const operatorProfile = await prisma.operatorProfile.findUnique({
        where: { userId: operator.id },
      });
      const route = await prisma.route.create({
        data: { fromCity: 'Lilongwe', toCity: 'Blantyre', basePrice: 12000, distanceKm: 250 },
      });
      const bus = await prisma.bus.create({
        data: {
          operatorId: operatorProfile!.id,
          name: 'Bus',
          plateNumber: 'BC-ADMIN1',
          capacity: 2,
        },
      });
      const trip = await prisma.trip.create({
        data: {
          operatorId: operatorProfile!.id,
          routeId: route.id,
          busId: bus.id,
          departureTime: new Date('2026-08-20T08:00:00+02:00'),
          arrivalTime: new Date('2026-08-20T10:00:00+02:00'),
          price: 12000,
        },
      });
      await prisma.seatInventory.create({ data: { tripId: trip.id, seatNumber: '1' } });
      const student = await studentUser();
      const bookingRes = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: {
          tripId: trip.id,
          seatNumber: '1',
          passengerName: 'Jane Student',
          passengerPhone: student.user.phone,
        },
      });
      expect(bookingRes.statusCode).toBe(201);
      await prisma.payment.create({
        data: {
          bookingId: bookingRes.json().id,
          txRef: `FB-${Math.random().toString(36).slice(2, 12)}`,
          amount: 12000,
          currency: 'MWK',
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/dashboard',
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const stats = res.json();
      expect(stats.totalUsers).toBeGreaterThanOrEqual(3);
      expect(stats.totalBookings).toBe(1);
      expect(stats.revenue.total).toBe('12000');
      expect(stats.activeOperators).toBe(1);
      expect(stats.bookings.PENDING).toBe(1);
    });

    it('GET /admin/dashboard is forbidden for students', async () => {
      const student = await studentUser();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/dashboard',
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('User management', () => {
    it('GET /admin/users returns a paginated list', async () => {
      const admin = await adminUser();
      await studentUser();
      await studentUser();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users',
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBeGreaterThanOrEqual(3);
      expect(res.json().items.length).toBeGreaterThanOrEqual(3);
    });

    it('GET /admin/users?role=STUDENT filters by role', async () => {
      const admin = await adminUser();
      await studentUser();
      await createTestUser({ role: 'OPERATOR' });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users?role=STUDENT',
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.every((u: { role: string }) => u.role === 'STUDENT')).toBe(true);
    });

    it('GET /admin/users?search= finds users by name', async () => {
      const admin = await adminUser();
      await studentUser('Zebra Specialist');
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users?search=Zebra',
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBe(1);
      expect(res.json().items[0].fullName).toBe('Zebra Specialist');
    });

    it('GET /admin/users/:id returns detail with counts', async () => {
      const admin = await adminUser();
      const student = await studentUser();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/users/${student.user.id}`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().email).toBe(student.email);
      expect(res.json()._count).toBeDefined();
    });

    it('GET /admin/users/:id returns 404 for a missing user', async () => {
      const admin = await adminUser();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/users/${'00000000-0000-4000-8000-000000000000'}`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('PATCH /admin/users/:id/status toggles isActive', async () => {
      const admin = await adminUser();
      const student = await studentUser();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/users/${student.user.id}/status`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().isActive).toBe(false);
      const after = await prisma.user.findUnique({ where: { id: student.user.id } });
      expect(after?.isActive).toBe(false);
    });

    it('DELETE /admin/users/:id soft-deletes a user', async () => {
      const admin = await superAdminUser();
      const student = await studentUser();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/users/${student.user.id}`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const after = await prisma.user.findUnique({ where: { id: student.user.id } });
      expect(after?.deletedAt).not.toBeNull();
      expect(after?.isActive).toBe(false);
      const login = await loginAs(student.email, 'password123');
      expect(login.statusCode).toBe(401);
    });

    it('DELETE /admin/users/:id forbids deleting another super admin', async () => {
      const adminA = await superAdminUser();
      const adminB = await superAdminUser();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/users/${adminB.user.id}`,
        headers: { authorization: `Bearer ${adminA.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE /admin/users/:id is forbidden for plain admins', async () => {
      const admin = await adminUser();
      const student = await studentUser();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/users/${student.user.id}`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Vendor/operator approval', () => {
    it('PATCH /admin/vendors/:id/approve toggles vendor isActive', async () => {
      const admin = await adminUser();
      const vendor = await createTestUser({ fullName: 'Vendor Co', role: 'VENDOR' });
      const profile = await prisma.vendorProfile.findUnique({ where: { userId: vendor.id } });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/vendors/${profile!.id}/approve`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().isActive).toBe(false);
    });

    it('PATCH /admin/operators/:id/approve toggles operator isActive', async () => {
      const admin = await adminUser();
      const operator = await createTestUser({ fullName: 'Operator Co', role: 'OPERATOR' });
      const profile = await prisma.operatorProfile.findUnique({ where: { userId: operator.id } });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/operators/${profile!.id}/approve`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().isActive).toBe(false);
    });

    it('approval endpoints are forbidden for non-admins', async () => {
      const student = await studentUser();
      const vendor = await createTestUser({ fullName: 'Vendor Co', role: 'VENDOR' });
      const profile = await prisma.vendorProfile.findUnique({ where: { userId: vendor.id } });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/vendors/${profile!.id}/approve`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Audit logs', () => {
    it('GET /admin/audit-logs returns paginated logs', async () => {
      const admin = await adminUser();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-logs',
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBeGreaterThanOrEqual(1);
    });

    it('GET /admin/audit-logs?action=auth.login filters by action', async () => {
      const admin = await adminUser();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-logs?action=auth.login',
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBeGreaterThan(0);
      expect(res.json().items.every((l: { action: string }) => l.action === 'auth.login')).toBe(
        true,
      );
    });

    it('GET /admin/audit-logs?from&to filters by date range', async () => {
      const admin = await adminUser();
      const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const to = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/audit-logs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Platform settings', () => {
    it('PUT /admin/settings/:key creates a setting', async () => {
      const admin = await superAdminUser();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/settings/maintenance_mode',
        headers: { authorization: `Bearer ${admin.accessToken}` },
        payload: { value: true },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().key).toBe('maintenance_mode');
      expect(res.json().value).toBe(true);
    });

    it('PUT /admin/settings/:key updates an existing setting', async () => {
      const admin = await superAdminUser();
      await prisma.platformSetting.create({ data: { key: 'flag', value: false } });
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/settings/flag',
        headers: { authorization: `Bearer ${admin.accessToken}` },
        payload: { value: true },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().value).toBe(true);
      const count = await prisma.platformSetting.count({ where: { key: 'flag' } });
      expect(count).toBe(1);
    });

    it('GET /admin/settings lists settings', async () => {
      const admin = await superAdminUser();
      await prisma.platformSetting.createMany({
        data: [
          { key: 'a', value: 1 },
          { key: 'b', value: 'x' },
        ],
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/settings',
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().length).toBe(2);
    });

    it('GET /admin/settings/:key returns a single setting', async () => {
      const admin = await superAdminUser();
      await prisma.platformSetting.create({ data: { key: 'app_version', value: '1.2.3' } });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/settings/app_version',
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().value).toBe('1.2.3');
    });

    it('GET /admin/settings/:key returns 404 for an unknown key', async () => {
      const admin = await superAdminUser();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/settings/nope',
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('settings endpoints are forbidden for plain admins', async () => {
      const admin = await adminUser();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/settings/maintenance_mode',
        headers: { authorization: `Bearer ${admin.accessToken}` },
        payload: { value: true },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
