import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma.js';
import { createUser } from '../auth/auth.service.js';

function otpHash(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

describe('notifications module', () => {
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
    await prisma.notificationPreference.deleteMany();
    await prisma.otpCode.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.foodOrderItem.deleteMany();
    await prisma.foodOrder.deleteMany();
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

  async function createStudentUser(name = 'Test Student') {
    const user = await createTestUser({ fullName: name, role: 'STUDENT' });
    const login = await loginAs(user.email, 'password123');
    return { user, email: user.email, accessToken: login.json().accessToken };
  }

  async function createPendingBooking(student: { accessToken: string }) {
    const operator = await createOperatorUser();
    const route = await prisma.route.create({
      data: { fromCity: 'Lilongwe', toCity: 'Mzuzu', basePrice: 15000, distanceKm: 350 },
    });
    const bus = await prisma.bus.create({
      data: {
        operatorId: operator.operatorProfile!.id,
        name: 'Coach',
        plateNumber: `BC-${Math.random().toString(36).slice(2, 8)}`,
        capacity: 3,
      },
    });
    const tripRes = await app.inject({
      method: 'POST',
      url: '/api/v1/trips',
      headers: { authorization: `Bearer ${operator.accessToken}` },
      payload: {
        routeId: route.id,
        busId: bus.id,
        departureTime: '2026-08-20T08:00:00+02:00',
        arrivalTime: '2026-08-20T12:30:00+02:00',
        price: 18000,
      },
    });
    expect(tripRes.statusCode).toBe(201);
    const bookingRes = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      headers: { authorization: `Bearer ${student.accessToken}` },
      payload: {
        tripId: tripRes.json().id,
        seatNumber: '1',
        passengerName: 'Jane Doe',
        passengerPhone: '+265991111222',
      },
    });
    expect(bookingRes.statusCode).toBe(201);
    return { bookingId: bookingRes.json().id as string, tripId: tripRes.json().id as string };
  }

  function futureOtp(userId: string, code = '123456', purpose = 'password_reset') {
    return prisma.otpCode.create({
      data: {
        userId,
        code: otpHash(code),
        purpose,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        maxAttempts: 5,
      },
    });
  }

  describe('Password reset OTP flow', () => {
    it('POST /auth/forgot-password sends an OTP via SMS + email', async () => {
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: { identifier: student.email },
      });
      expect(res.statusCode).toBe(202);
      const otps = await prisma.otpCode.findMany({ where: { userId: student.user.id } });
      expect(otps.length).toBe(1);
      expect(otps[0]?.purpose).toBe('password_reset');
      const notifs = await prisma.notification.findMany({ where: { userId: student.user.id } });
      expect(notifs.map((n) => n.channel).sort()).toEqual(['EMAIL', 'SMS']);
    });

    it('POST /auth/forgot-password does not leak whether an account exists', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: { identifier: 'ghost@nowhere.mw' },
      });
      expect(res.statusCode).toBe(202);
      const otps = await prisma.otpCode.count();
      expect(otps).toBe(0);
    });

    it('POST /auth/reset-password updates the password with a correct code', async () => {
      const student = await createStudentUser();
      await futureOtp(student.user.id);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: { identifier: student.email, code: '123456', newPassword: 'newpassword99' },
      });
      expect(res.statusCode).toBe(200);
      const login = await loginAs(student.email, 'newpassword99');
      expect(login.statusCode).toBe(200);
      const otp = await prisma.otpCode.findFirst({ where: { userId: student.user.id } });
      expect(otp?.usedAt).not.toBeNull();
    });

    it('POST /auth/reset-password rejects a wrong code and increments attempts', async () => {
      const student = await createStudentUser();
      await futureOtp(student.user.id);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: { identifier: student.email, code: '000000', newPassword: 'newpassword99' },
      });
      expect(res.statusCode).toBe(401);
      const otp = await prisma.otpCode.findFirst({ where: { userId: student.user.id } });
      expect(otp?.attempts).toBe(1);
    });

    it('POST /auth/reset-password rejects an expired code', async () => {
      const student = await createStudentUser();
      await prisma.otpCode.create({
        data: {
          userId: student.user.id,
          code: otpHash('123456'),
          purpose: 'password_reset',
          expiresAt: new Date(Date.now() - 1000),
          maxAttempts: 5,
        },
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: { identifier: student.email, code: '123456', newPassword: 'newpassword99' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /auth/reset-password rejects a code after max attempts', async () => {
      const student = await createStudentUser();
      await prisma.otpCode.create({
        data: {
          userId: student.user.id,
          code: otpHash('123456'),
          purpose: 'password_reset',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 5,
          maxAttempts: 5,
        },
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: { identifier: student.email, code: '123456', newPassword: 'newpassword99' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Invite flow', () => {
    it('POST /auth/invite by an admin creates an inactive user and sends a code', async () => {
      const admin = await createTestUser({ role: 'ADMIN', fullName: 'Admin' });
      const login = await loginAs(admin.email, 'password123');
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/invite',
        headers: { authorization: `Bearer ${login.json().accessToken}` },
        payload: {
          email: `invite-${Math.random().toString(36).slice(2)}@foodiebus.mw`,
          phone: '+265990000123',
          fullName: 'Invitee',
          role: 'STUDENT',
        },
      });
      expect(res.statusCode).toBe(201);
      const invited = await prisma.user.findUnique({ where: { id: res.json().id } });
      expect(invited?.isActive).toBe(false);
      const otps = await prisma.otpCode.findMany({ where: { userId: invited!.id } });
      expect(otps.length).toBe(1);
      expect(otps[0]?.purpose).toBe('invite');
    });

    it('POST /auth/invite by a non-admin is forbidden', async () => {
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/invite',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: {
          email: 'x@foodiebus.mw',
          phone: '+265990000111',
          fullName: 'X',
          role: 'STUDENT',
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /auth/invite rejects a duplicate email or phone', async () => {
      const admin = await createTestUser({ role: 'ADMIN', fullName: 'Admin' });
      const login = await loginAs(admin.email, 'password123');
      const existing = await createStudentUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/invite',
        headers: { authorization: `Bearer ${login.json().accessToken}` },
        payload: {
          email: existing.email,
          phone: '+265990000222',
          fullName: 'Dup',
          role: 'STUDENT',
        },
      });
      expect(res.statusCode).toBe(409);
    });

    it('POST /auth/verify-invite activates the user and sets the password', async () => {
      const invited = await createUser(
        {
          email: `inv-${Math.random().toString(36).slice(2)}@foodiebus.mw`,
          phone: '+265990000333',
          password: 'temp-pass-1',
          fullName: 'Invitee',
          role: 'STUDENT',
        },
        'SUPER_ADMIN',
      );
      await prisma.user.update({ where: { id: invited.id }, data: { isActive: false } });
      await futureOtp(invited.id, '654321', 'invite');
      const userRecord = await prisma.user.findUnique({ where: { id: invited.id } });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-invite',
        payload: {
          email: userRecord!.email,
          code: '654321',
          newPassword: 'invitedpass9',
        },
      });
      expect(res.statusCode).toBe(200);
      const after = await prisma.user.findUnique({ where: { id: invited.id } });
      expect(after?.isActive).toBe(true);
      const login = await loginAs(userRecord!.email, 'invitedpass9');
      expect(login.statusCode).toBe(200);
    });
  });

  describe('Notification CRUD', () => {
    it('GET /notifications/me lists my notifications', async () => {
      const student = await createStudentUser();
      await prisma.notification.createMany({
        data: [
          { userId: student.user.id, channel: 'SMS', body: 'hello one' },
          { userId: student.user.id, channel: 'EMAIL', subject: 'Subj', body: 'hello two' },
        ],
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications/me',
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(2);
      expect(res.json().total).toBe(2);
    });

    it('GET /notifications/me requires auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/notifications/me' });
      expect(res.statusCode).toBe(401);
    });

    it('PATCH /notifications/:id/read marks my notification as read', async () => {
      const student = await createStudentUser();
      const notif = await prisma.notification.create({
        data: { userId: student.user.id, channel: 'SMS', body: 'hello' },
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notifications/${notif.id}/read`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const updated = await prisma.notification.findUnique({ where: { id: notif.id } });
      expect(updated?.status).toBe('READ');
    });

    it('PATCH /notifications/:id/read forbids another user', async () => {
      const owner = await createStudentUser('Owner');
      const other = await createStudentUser('Other');
      const notif = await prisma.notification.create({
        data: { userId: owner.user.id, channel: 'SMS', body: 'hello' },
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notifications/${notif.id}/read`,
        headers: { authorization: `Bearer ${other.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Notification preferences', () => {
    it('GET /notifications/preferences returns defaults', async () => {
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications/preferences',
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ sms: true, whatsapp: true, email: true });
    });

    it('PUT /notifications/preferences updates channels', async () => {
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/notifications/preferences',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { sms: false },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().sms).toBe(false);
      expect(res.json().email).toBe(true);
    });

    it('PUT /notifications/preferences rejects disabling all channels', async () => {
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/notifications/preferences',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { sms: false, whatsapp: false, email: false },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Booking expiry', () => {
    it('expires a stale PENDING booking, releases the seat, and notifies', async () => {
      const student = await createStudentUser();
      const { bookingId, tripId } = await createPendingBooking(student);
      await prisma.booking.update({
        where: { id: bookingId },
        data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) },
      });

      const { expireStaleBookings } = await import('./booking-expiry.service.js');
      const expired = await expireStaleBookings();
      expect(expired).toBe(1);

      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      expect(booking?.status).toBe('EXPIRED');
      const seat = await prisma.seatInventory.findFirst({ where: { tripId, seatNumber: '1' } });
      expect(seat?.status).toBe('AVAILABLE');
      const notifs = await prisma.notification.findMany({
        where: { userId: student.user.id, referenceType: 'booking' },
      });
      expect(notifs.length).toBeGreaterThan(0);
    });

    it('does not expire a recent PENDING booking', async () => {
      const student = await createStudentUser();
      const { bookingId } = await createPendingBooking(student);
      const { expireStaleBookings } = await import('./booking-expiry.service.js');
      const expired = await expireStaleBookings();
      expect(expired).toBe(0);
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      expect(booking?.status).toBe('PENDING');
    });

    it('leaves CONFIRMED bookings untouched', async () => {
      const student = await createStudentUser();
      const { bookingId } = await createPendingBooking(student);
      await prisma.booking.update({
        where: { id: bookingId },
        data: { status: 'CONFIRMED', createdAt: new Date(Date.now() - 60 * 60 * 1000) },
      });
      const { expireStaleBookings } = await import('./booking-expiry.service.js');
      const expired = await expireStaleBookings();
      expect(expired).toBe(0);
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      expect(booking?.status).toBe('CONFIRMED');
    });
  });

  describe('Push device tokens', () => {
    it('registers a device token (upsert)', async () => {
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/devices',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { token: 'fcm-token-abc123', platform: 'ANDROID' },
      });
      expect(res.statusCode).toBe(201);
      const again = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/devices',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { token: 'fcm-token-abc123', platform: 'IOS' },
      });
      expect(again.statusCode).toBe(201);
      const count = await prisma.deviceToken.count({ where: { userId: student.user.id } });
      expect(count).toBe(1);
      const device = await prisma.deviceToken.findFirst({ where: { userId: student.user.id } });
      expect(device?.platform).toBe('IOS');
    });

    it('lists own device tokens', async () => {
      const student = await createStudentUser();
      await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/devices',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { token: 'fcm-token-xyz' },
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications/devices',
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(1);
    });

    it('removes a device token', async () => {
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/devices',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { token: 'fcm-token-remove' },
      });
      const id = res.json().id as string;
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/notifications/devices/${id}`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(del.statusCode).toBe(204);
      const gone = await prisma.deviceToken.findUnique({ where: { id } });
      expect(gone).toBeNull();
    });

    it('forbids removing another user device token', async () => {
      const studentA = await createStudentUser();
      const studentB = await createStudentUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/devices',
        headers: { authorization: `Bearer ${studentA.accessToken}` },
        payload: { token: 'fcm-token-other' },
      });
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/notifications/devices/${res.json().id}`,
        headers: { authorization: `Bearer ${studentB.accessToken}` },
      });
      expect(del.statusCode).toBe(403);
    });
  });
});
