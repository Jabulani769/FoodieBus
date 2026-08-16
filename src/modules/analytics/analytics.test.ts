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
const mockedRefund = vi.mocked(paychangu.refund);

const RANGE = 'from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z';

describe('analytics module', () => {
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
    mockedRefund.mockReset();
    mockedInitiate.mockResolvedValue({
      checkoutUrl: 'https://checkout.test/fb-default',
      txRef: `FB-${Math.random().toString(36).slice(2, 10)}`,
    });
    mockedVerify.mockResolvedValue({ status: 'success', amount: 18000, currency: 'MWK' });
    mockedRefund.mockResolvedValue({
      refundId: 'RF-' + Math.random().toString(36).slice(2, 10),
      status: 'processed',
    });

    await prisma.rating.deleteMany();
    await prisma.webhookEvent.deleteMany();

    await prisma.reconciliationMismatch.deleteMany();

    await prisma.driverTripPayout.deleteMany();
    await prisma.refund.deleteMany();
    await prisma.settlement.deleteMany();
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
    await prisma.notification.deleteMany();
    await prisma.otpCode.deleteMany();
    await prisma.notificationPreference.deleteMany();
    await prisma.platformSetting.deleteMany();
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

  async function createStaffUser(role: 'SUPER_ADMIN' | 'ADMIN' | 'FINANCIAL' = 'FINANCIAL') {
    const user = await createTestUser({ fullName: 'Staff', role });
    const login = await loginAs(user.email, 'password123');
    return { user, email: user.email, accessToken: login.json().accessToken };
  }

  async function createStudentUser(name = 'Test Student') {
    const user = await createTestUser({ fullName: name, role: 'STUDENT' });
    const login = await loginAs(user.email, 'password123');
    return { user, email: user.email, accessToken: login.json().accessToken };
  }

  async function createTripWithSeats({
    routeFrom = 'Lilongwe',
    routeTo = 'Mzuzu',
    price = 18000,
  } = {}) {
    const operator = await createOperatorUser();
    const route = await prisma.route.upsert({
      where: { fromCity_toCity: { fromCity: routeFrom, toCity: routeTo } },
      create: { fromCity: routeFrom, toCity: routeTo, basePrice: 15000, distanceKm: 350 },
      update: {},
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
        price,
      },
    });
    expect(tripRes.statusCode).toBe(201);
    return { operator, route, bus, tripId: tripRes.json().id as string };
  }

  async function createBookingFor(student: { accessToken: string }) {
    const { tripId } = await createTripWithSeats();
    const bookingRes = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      headers: { authorization: `Bearer ${student.accessToken}` },
      payload: {
        tripId,
        seatNumber: '1',
        passengerName: 'Jane Doe',
        passengerPhone: '+265991111222',
      },
    });
    expect(bookingRes.statusCode).toBe(201);
    return { bookingId: bookingRes.json().id as string, tripId };
  }

  async function createPaidBookingFor(student: { accessToken: string }) {
    const { bookingId } = await createBookingFor(student);
    const init = await app.inject({
      method: 'POST',
      url: '/api/v1/payments',
      headers: { authorization: `Bearer ${student.accessToken}` },
      payload: { bookingId },
    });
    expect(init.statusCode).toBe(201);
    const paymentId = init.json().id as string;
    const verify = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentId}/verify`,
      headers: { authorization: `Bearer ${student.accessToken}` },
    });
    expect(verify.statusCode).toBe(200);
    return { bookingId, paymentId, txRef: init.json().txRef as string };
  }

  async function getAnalytics(url: string, token: string) {
    return app.inject({
      method: 'GET',
      url: `/api/v1/${url}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  describe('Platform overview', () => {
    it('GET /analytics/platform/overview returns KPIs with previous-period comparison', async () => {
      const staff = await createStaffUser('ADMIN');
      const student = await createStudentUser();
      await createPaidBookingFor(student);

      const res = await getAnalytics(`analytics/platform/overview?${RANGE}`, staff.accessToken);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.current.newUsers).toBeGreaterThanOrEqual(2);
      expect(body.current.bookings).toBe(1);
      expect(body.current.revenue).toBe(18000);
      expect(body.current.paidPayments).toBe(1);
      expect('newUsers' in body.previous).toBe(true);
      expect('changePercent' in body).toBe(true);
      expect(body.previous.bookings).toBe(0);
    });

    it('GET /analytics/platform/overview returns zeros when there is no data', async () => {
      const staff = await createStaffUser('ADMIN');
      const res = await getAnalytics(`analytics/platform/overview?${RANGE}`, staff.accessToken);
      expect(res.statusCode).toBe(200);
      expect(res.json().current.bookings).toBe(0);
      expect(res.json().current.revenue).toBe(0);
    });
  });

  describe('Platform growth', () => {
    it('GET /analytics/platform/growth?granularity=daily returns a daily series', async () => {
      const staff = await createStaffUser('ADMIN');
      const student = await createStudentUser();
      await createPaidBookingFor(student);
      const res = await getAnalytics(
        `analytics/platform/growth?${RANGE}&granularity=daily`,
        staff.accessToken,
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().granularity).toBe('daily');
      const items = res.json().items;
      expect(items.length).toBeGreaterThan(0);
      const todayKey = new Date().toISOString().slice(0, 10);
      const today = items.find((i: { period: string }) => i.period === todayKey);
      expect(today).toBeTruthy();
      expect(today.bookings).toBe(1);
      expect(today.revenue).toBe('18000.00');
    });

    it('GET /analytics/platform/growth?granularity=monthly groups by month', async () => {
      const staff = await createStaffUser('ADMIN');
      const student = await createStudentUser();
      await createPaidBookingFor(student);
      const res = await getAnalytics(
        `analytics/platform/growth?${RANGE}&granularity=monthly`,
        staff.accessToken,
      );
      expect(res.statusCode).toBe(200);
      const items = res.json().items;
      expect(items.some((i: { period: string }) => i.period === '2026-08')).toBe(true);
    });
  });

  describe('Seat utilization', () => {
    it('GET /analytics/utilization/trips returns per-trip utilization', async () => {
      const staff = await createStaffUser('ADMIN');
      const student = await createStudentUser();
      const { tripId } = await createBookingFor(student);
      const res = await getAnalytics(`analytics/utilization/trips?${RANGE}`, staff.accessToken);
      expect(res.statusCode).toBe(200);
      const item = res.json().items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(item).toBeTruthy();
      expect(item.capacity).toBe(3);
      expect(item.booked).toBe(0); // seat still HELD after booking (not paid)
    });

    it('GET /analytics/utilization/trips reports a booked seat as BOOKED after payment', async () => {
      const staff = await createStaffUser('ADMIN');
      const student = await createStudentUser();
      const { bookingId } = await createBookingFor(student);
      const init = await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId },
      });
      const verify = await app.inject({
        method: 'POST',
        url: `/api/v1/payments/${init.json().id}/verify`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(verify.statusCode).toBe(200);
      const res = await getAnalytics(`analytics/utilization/trips?${RANGE}`, staff.accessToken);
      const item = res.json().items[0];
      expect(item.booked).toBe(1);
      expect(item.utilization).toBe(33.3);
    });

    it('GET /analytics/utilization/routes aggregates by route', async () => {
      const staff = await createStaffUser('ADMIN');
      const student = await createStudentUser();
      await createBookingFor(student);
      const res = await getAnalytics(`analytics/utilization/routes?${RANGE}`, staff.accessToken);
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(1);
      expect(res.json().items[0].name).toBe('Lilongwe → Mzuzu');
      expect(res.json().items[0].totalCapacity).toBe(3);
    });

    it('GET /analytics/utilization/operators aggregates by operator', async () => {
      const staff = await createStaffUser('ADMIN');
      const student = await createStudentUser();
      await createBookingFor(student);
      const res = await getAnalytics(`analytics/utilization/operators?${RANGE}`, staff.accessToken);
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(1);
      expect(res.json().items[0].totalCapacity).toBe(3);
    });
  });

  describe('Conversion funnels', () => {
    it('GET /analytics/funnel/bookings reports counts and rates', async () => {
      const staff = await createStaffUser('ADMIN');
      const student = await createStudentUser();
      const { bookingId } = await createBookingFor(student);
      await prisma.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } });
      const { bookingId: second } = await createBookingFor(student);
      await prisma.booking.update({ where: { id: second }, data: { status: 'CANCELLED' } });

      const res = await getAnalytics(`analytics/funnel/bookings?${RANGE}`, staff.accessToken);
      expect(res.statusCode).toBe(200);
      expect(res.json().confirmed).toBe(1);
      expect(res.json().cancelled).toBe(1);
      expect(res.json().total).toBe(2);
      expect(res.json().conversionRate).toBe(50);
    });

    it('GET /analytics/funnel/payments reports success and failure rates', async () => {
      const staff = await createStaffUser('ADMIN');
      const student = await createStudentUser();
      await createPaidBookingFor(student);
      const res = await getAnalytics(`analytics/funnel/payments?${RANGE}`, staff.accessToken);
      expect(res.statusCode).toBe(200);
      expect(res.json().paid).toBe(1);
      expect(res.json().successRate).toBe(100);
    });
  });

  describe('Passenger analytics', () => {
    it('GET /analytics/passengers/overview returns unique and repeat rate', async () => {
      const staff = await createStaffUser('ADMIN');
      const student = await createStudentUser();
      const { tripId } = await createBookingFor(student);
      const seat2 = await prisma.seatInventory.findFirst({
        where: { tripId, seatNumber: '2' },
      });
      await prisma.booking.create({
        data: {
          tripId,
          seatId: seat2!.id,
          passengerId: student.user.id,
          passengerName: 'Jane Doe',
          passengerPhone: '+265991111222',
          status: 'PENDING',
          totalAmount: 18000,
        },
      });

      const res = await getAnalytics(`analytics/passengers/overview?${RANGE}`, staff.accessToken);
      expect(res.statusCode).toBe(200);
      expect(res.json().uniquePassengers).toBe(1);
      expect(res.json().totalBookings).toBe(2);
      expect(res.json().repeatPassengerRate).toBe(100);
    });

    it('GET /analytics/passengers/top?sortBy=bookings ranks by booking count', async () => {
      const staff = await createStaffUser('ADMIN');
      const student = await createStudentUser();
      const { tripId } = await createBookingFor(student);
      const seat2 = await prisma.seatInventory.findFirst({
        where: { tripId, seatNumber: '2' },
      });
      await prisma.booking.create({
        data: {
          tripId,
          seatId: seat2!.id,
          passengerId: student.user.id,
          passengerName: 'Jane Doe',
          passengerPhone: '+265991111222',
          status: 'PENDING',
          totalAmount: 18000,
        },
      });
      const res = await getAnalytics(
        `analytics/passengers/top?${RANGE}&sortBy=bookings&limit=5`,
        staff.accessToken,
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().items[0].passengerId).toBe(student.user.id);
      expect(res.json().items[0].bookings).toBe(2);
      expect(res.json().items[0].totalSpend).toBe('36000');
    });
  });

  describe('Notification analytics', () => {
    it('GET /analytics/notifications/delivery-rate computes per-channel delivery', async () => {
      const staff = await createStaffUser('ADMIN');
      const student = await createStudentUser();
      await prisma.notification.createMany({
        data: [
          {
            userId: student.user.id,
            channel: 'SMS',
            body: 'a',
            status: 'DELIVERED',
          },
          {
            userId: student.user.id,
            channel: 'SMS',
            body: 'b',
            status: 'FAILED',
            failureReason: 'invalid phone',
          },
          {
            userId: student.user.id,
            channel: 'EMAIL',
            body: 'c',
            status: 'SENT',
          },
        ],
      });
      const res = await getAnalytics(
        `analytics/notifications/delivery-rate?${RANGE}`,
        staff.accessToken,
      );
      expect(res.statusCode).toBe(200);
      const sms = res.json().items.find((i: { channel: string }) => i.channel === 'SMS');
      expect(sms.sent).toBe(2);
      expect(sms.delivered).toBe(1);
      expect(sms.failed).toBe(1);
      expect(sms.deliveryRate).toBe(50);
    });

    it('GET /analytics/notifications/failures groups failure reasons', async () => {
      const staff = await createStaffUser('ADMIN');
      const student = await createStudentUser();
      await prisma.notification.createMany({
        data: [
          {
            userId: student.user.id,
            channel: 'SMS',
            body: 'x',
            status: 'FAILED',
            failureReason: 'invalid phone',
          },
          {
            userId: student.user.id,
            channel: 'SMS',
            body: 'y',
            status: 'FAILED',
            failureReason: 'invalid phone',
          },
          {
            userId: student.user.id,
            channel: 'EMAIL',
            body: 'z',
            status: 'FAILED',
            failureReason: 'bounce',
          },
        ],
      });
      const res = await getAnalytics(
        `analytics/notifications/failures?${RANGE}`,
        staff.accessToken,
      );
      expect(res.statusCode).toBe(200);
      const invalid = res
        .json()
        .items.find((i: { reason: string }) => i.reason === 'invalid phone');
      expect(invalid.count).toBe(2);
    });
  });

  describe('Refund analytics', () => {
    it('GET /analytics/refunds/summary reports refund volume and rates', async () => {
      const staff = await createStaffUser('FINANCIAL');
      const superAdmin = await createStaffUser('SUPER_ADMIN');
      const student = await createStudentUser();
      const { paymentId } = await createPaidBookingFor(student);
      await createPaidBookingFor(student); // second payment stays PAID (revenue base)
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/financial/refunds',
        headers: { authorization: `Bearer ${staff.accessToken}` },
        payload: { paymentId, amount: 18000, reason: 'Customer requested' },
      });
      expect(created.statusCode).toBe(201);
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/financial/refunds/${created.json().id}/approve`,
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/financial/refunds/${created.json().id}/process`,
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
      });

      const res = await getAnalytics(`analytics/refunds/summary?${RANGE}`, staff.accessToken);
      expect(res.statusCode).toBe(200);
      expect(res.json().totalRequests).toBe(1);
      expect(res.json().processed).toBe(1);
      expect(res.json().totalRefunded).toBe('18000.00');
      expect(res.json().refundRate).toBe(100);
    });
  });

  describe('Access control', () => {
    it('denies students, vendors and operators', async () => {
      const student = await createStudentUser();
      const vendor = await createTestUser({ fullName: 'V', role: 'VENDOR' });
      const operator = await createTestUser({ fullName: 'O', role: 'OPERATOR' });

      for (const u of [student, vendor, operator]) {
        const login = await loginAs(u.email, 'password123');
        const res = await getAnalytics(
          `analytics/platform/overview?${RANGE}`,
          login.json().accessToken,
        );
        expect(res.statusCode).toBe(403);
      }
    });

    it('allows ADMIN and FINANCIAL roles', async () => {
      const admin = await createStaffUser('ADMIN');
      const fin = await createStaffUser('FINANCIAL');
      for (const staff of [admin, fin]) {
        const res = await getAnalytics(`analytics/platform/overview?${RANGE}`, staff.accessToken);
        expect(res.statusCode).toBe(200);
      }
    });
  });
});
