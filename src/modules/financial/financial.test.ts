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

describe('financial module', () => {
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

  async function createStaffUser(role: 'SUPER_ADMIN' | 'FINANCIAL' = 'FINANCIAL') {
    const user = await createTestUser({ fullName: 'Staff', role });
    const login = await loginAs(user.email, 'password123');
    return { user, email: user.email, accessToken: login.json().accessToken };
  }

  async function createStudentUser(name = 'Test Student') {
    const user = await createTestUser({ fullName: name, role: 'STUDENT' });
    const login = await loginAs(user.email, 'password123');
    return { user, email: user.email, accessToken: login.json().accessToken };
  }

  async function createBookingFor(student: { accessToken: string }) {
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

  // Creates a fully PAID booking (booking confirmed, seat booked).
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
    expect(verify.json().status).toBe('PAID');
    return { bookingId, paymentId, txRef: init.json().txRef as string };
  }

  async function createCompletedTrip(opts: { withDriver?: boolean } = {}) {
    const operator = await createOperatorUser();
    const route = await prisma.route.create({
      data: { fromCity: 'Lilongwe', toCity: 'Blantyre', basePrice: 12000, distanceKm: 300 },
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
        price: 15000,
      },
    });
    expect(tripRes.statusCode).toBe(201);
    const tripId = tripRes.json().id as string;

    let driverId: string | null = null;
    if (opts.withDriver) {
      const driverRes = await app.inject({
        method: 'POST',
        url: '/api/v1/drivers',
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: {
          fullName: 'Kapiya Mbewe',
          phone: `+26599${String(Math.floor(1000000 + Math.random() * 9000000))}`,
          email: `driver-${Math.random().toString(36).slice(2)}@foodiebus.mw`,
          password: 'password123',
          licenseNumber: 'DL-2026-001',
        },
      });
      expect(driverRes.statusCode).toBe(201);
      driverId = driverRes.json().id;
      const assign = await app.inject({
        method: 'POST',
        url: `/api/v1/trips/${tripId}/assign-driver`,
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: { driverId },
      });
      expect(assign.statusCode).toBe(200);
    }

    await prisma.trip.update({ where: { id: tripId }, data: { status: 'IN_TRANSIT' } });
    const complete = await app.inject({
      method: 'PATCH',
      url: `/api/v1/trips/${tripId}/status`,
      headers: { authorization: `Bearer ${operator.accessToken}` },
      payload: { status: 'COMPLETED' },
    });
    expect(complete.statusCode).toBe(200);
    return { operator, tripId, driverId };
  }

  describe('Refund lifecycle', () => {
    it('POST /financial/refunds requests a refund for a PAID payment', async () => {
      const staff = await createStaffUser();
      const student = await createStudentUser();
      const { paymentId } = await createPaidBookingFor(student);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/financial/refunds',
        headers: { authorization: `Bearer ${staff.accessToken}` },
        payload: { paymentId, amount: 18000, reason: 'Customer requested' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().status).toBe('REQUESTED');
      expect(res.json().paymentId).toBe(paymentId);
    });

    it('POST /financial/refunds rejects a non-PAID payment', async () => {
      const staff = await createStaffUser();
      const student = await createStudentUser();
      const { bookingId } = await createBookingFor(student);
      const init = await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId },
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/financial/refunds',
        headers: { authorization: `Bearer ${staff.accessToken}` },
        payload: { paymentId: init.json().id, amount: 100, reason: 'Oops' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('POST /financial/refunds rejects an amount above the refundable balance', async () => {
      const staff = await createStaffUser();
      const student = await createStudentUser();
      const { paymentId } = await createPaidBookingFor(student);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/financial/refunds',
        headers: { authorization: `Bearer ${staff.accessToken}` },
        payload: { paymentId, amount: 99999, reason: 'Too much' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('POST /financial/refunds forbids students', async () => {
      const student = await createStudentUser();
      const { paymentId } = await createPaidBookingFor(student);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/financial/refunds',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { paymentId, amount: 100, reason: 'Hack' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('GET /financial/refunds lists refund requests with filters', async () => {
      const staff = await createStaffUser();
      const student = await createStudentUser();
      const { paymentId } = await createPaidBookingFor(student);
      await app.inject({
        method: 'POST',
        url: '/api/v1/financial/refunds',
        headers: { authorization: `Bearer ${staff.accessToken}` },
        payload: { paymentId, amount: 18000, reason: 'Customer requested' },
      });
      const all = await app.inject({
        method: 'GET',
        url: '/api/v1/financial/refunds',
        headers: { authorization: `Bearer ${staff.accessToken}` },
      });
      expect(all.statusCode).toBe(200);
      expect(all.json().total).toBe(1);
      const filtered = await app.inject({
        method: 'GET',
        url: '/api/v1/financial/refunds?status=APPROVED',
        headers: { authorization: `Bearer ${staff.accessToken}` },
      });
      expect(filtered.json().total).toBe(0);
    });

    it('PATCH /financial/refunds/:id/approve approves a requested refund (super admin)', async () => {
      const staff = await createStaffUser();
      const superAdmin = await createStaffUser('SUPER_ADMIN');
      const student = await createStudentUser();
      const { paymentId } = await createPaidBookingFor(student);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/financial/refunds',
        headers: { authorization: `Bearer ${staff.accessToken}` },
        payload: { paymentId, amount: 18000, reason: 'Customer requested' },
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/financial/refunds/${created.json().id}/approve`,
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('APPROVED');
      expect(res.json().approvedBy.id).toBe(superAdmin.user.id);
    });

    it('PATCH /financial/refunds/:id/approve is denied for a financial-only user', async () => {
      const staff = await createStaffUser();
      const student = await createStudentUser();
      const { paymentId } = await createPaidBookingFor(student);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/financial/refunds',
        headers: { authorization: `Bearer ${staff.accessToken}` },
        payload: { paymentId, amount: 18000, reason: 'Customer requested' },
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/financial/refunds/${created.json().id}/approve`,
        headers: { authorization: `Bearer ${staff.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('PATCH /financial/refunds/:id/reject rejects with a reason', async () => {
      const staff = await createStaffUser();
      const superAdmin = await createStaffUser('SUPER_ADMIN');
      const student = await createStudentUser();
      const { paymentId } = await createPaidBookingFor(student);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/financial/refunds',
        headers: { authorization: `Bearer ${staff.accessToken}` },
        payload: { paymentId, amount: 18000, reason: 'Customer requested' },
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/financial/refunds/${created.json().id}/reject`,
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
        payload: { reason: 'Outside refund window' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('REJECTED');
      expect(res.json().failureReason).toBe('Outside refund window');
    });

    it('POST /financial/refunds/:id/process refunds the payment and cancels the booking', async () => {
      const staff = await createStaffUser();
      const superAdmin = await createStaffUser('SUPER_ADMIN');
      const student = await createStudentUser();
      const { bookingId, paymentId } = await createPaidBookingFor(student);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/financial/refunds',
        headers: { authorization: `Bearer ${staff.accessToken}` },
        payload: { paymentId, amount: 18000, reason: 'Customer requested' },
      });
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/financial/refunds/${created.json().id}/approve`,
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/financial/refunds/${created.json().id}/process`,
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('PROCESSED');
      expect(mockedRefund).toHaveBeenCalledTimes(1);
      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(payment?.status).toBe('REFUNDED');
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      expect(booking?.status).toBe('CANCELLED');
      const seat = await prisma.seatInventory.findFirst({
        where: { tripId: booking!.tripId, seatNumber: '1' },
      });
      expect(seat?.status).toBe('AVAILABLE');
    });

    it('POST /financial/refunds/:id/process marks FAILED when PayChangu rejects', async () => {
      mockedRefund.mockRejectedValue(new Error('gateway down'));
      const staff = await createStaffUser();
      const superAdmin = await createStaffUser('SUPER_ADMIN');
      const student = await createStudentUser();
      const { paymentId } = await createPaidBookingFor(student);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/financial/refunds',
        headers: { authorization: `Bearer ${staff.accessToken}` },
        payload: { paymentId, amount: 18000, reason: 'Customer requested' },
      });
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/financial/refunds/${created.json().id}/approve`,
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/financial/refunds/${created.json().id}/process`,
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
      });
      expect(res.statusCode).toBe(402);
      const refund = await prisma.refund.findUnique({ where: { id: created.json().id } });
      expect(refund?.status).toBe('FAILED');
      expect(refund?.failureReason).toBe('gateway down');
    });
  });

  describe('Revenue reports', () => {
    it('GET /financial/reports/revenue returns a daily breakdown', async () => {
      const staff = await createStaffUser();
      const student = await createStudentUser();
      await createPaidBookingFor(student);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/financial/reports/revenue?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z',
        headers: { authorization: `Bearer ${staff.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().totalPayments).toBe(1);
      expect(res.json().totalRevenue).toBe('18000.00');
      expect(res.json().daily.length).toBe(1);
    });

    it('GET /financial/reports/revenue/by-route groups revenue by route', async () => {
      const staff = await createStaffUser();
      const student = await createStudentUser();
      await createPaidBookingFor(student);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/financial/reports/revenue/by-route?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z',
        headers: { authorization: `Bearer ${staff.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(1);
      expect(res.json().items[0].route).toBe('Lilongwe → Mzuzu');
      expect(res.json().items[0].revenue).toBe('18000.00');
    });

    it('GET /financial/reports/revenue/by-operator groups revenue by operator', async () => {
      const staff = await createStaffUser();
      const student = await createStudentUser();
      await createPaidBookingFor(student);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/financial/reports/revenue/by-operator?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z',
        headers: { authorization: `Bearer ${staff.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(1);
      expect(res.json().items[0].revenue).toBe('18000.00');
    });

    it('GET /financial/reports/payments/export returns a CSV', async () => {
      const staff = await createStaffUser();
      const student = await createStudentUser();
      await createPaidBookingFor(student);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/financial/reports/payments/export?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z',
        headers: { authorization: `Bearer ${staff.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const csv = res.body;
      expect(csv).toContain('TxRef,Date,Amount,Charges,Route,Seat,Passenger,Phone,Operator');
      expect(csv).toContain('Lilongwe → Mzuzu');
      expect(csv).toContain('18000');
    });

    it('reports are denied for students', async () => {
      const student = await createStudentUser();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/financial/reports/revenue?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z',
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Settlements', () => {
    it('POST /financial/settlements/generate creates operator settlements', async () => {
      const superAdmin = await createStaffUser('SUPER_ADMIN');
      const student = await createStudentUser();
      const { paymentId } = await createPaidBookingFor(student);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/financial/settlements/generate',
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
        payload: { period: '2026-08' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(1);
      expect(res.json().items[0].grossRevenue.toString()).toBe('18000');
      expect(res.json().items[0].commissionRate.toString()).toBe('0.1');
      expect(res.json().items[0].netPayout.toString()).toBe('16200');
      expect(paymentId).toBeTruthy();
    });

    it('POST /financial/settlements/generate is idempotent for the same period', async () => {
      const superAdmin = await createStaffUser('SUPER_ADMIN');
      const student = await createStudentUser();
      await createPaidBookingFor(student);
      await app.inject({
        method: 'POST',
        url: '/api/v1/financial/settlements/generate',
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
        payload: { period: '2026-08' },
      });
      const second = await app.inject({
        method: 'POST',
        url: '/api/v1/financial/settlements/generate',
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
        payload: { period: '2026-08' },
      });
      expect(second.statusCode).toBe(200);
      expect(second.json().items.length).toBe(0);
      const count = await prisma.settlement.count();
      expect(count).toBe(1);
    });

    it('GET /financial/settlements lists settlements with filters', async () => {
      const superAdmin = await createStaffUser('SUPER_ADMIN');
      const student = await createStudentUser();
      await createPaidBookingFor(student);
      await app.inject({
        method: 'POST',
        url: '/api/v1/financial/settlements/generate',
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
        payload: { period: '2026-08' },
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/financial/settlements?period=2026-08&status=PENDING',
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBe(1);
    });

    it('PATCH /financial/settlements/:id/pay marks a settlement paid', async () => {
      const superAdmin = await createStaffUser('SUPER_ADMIN');
      const student = await createStudentUser();
      await createPaidBookingFor(student);
      const gen = await app.inject({
        method: 'POST',
        url: '/api/v1/financial/settlements/generate',
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
        payload: { period: '2026-08' },
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/financial/settlements/${gen.json().items[0].id}/pay`,
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('PAID');
      expect(res.json().paidAt).not.toBeNull();
    });

    it('settlement generation is denied for financial-only users', async () => {
      const staff = await createStaffUser();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/financial/settlements/generate',
        headers: { authorization: `Bearer ${staff.accessToken}` },
        payload: { period: '2026-08' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Driver payouts', () => {
    async function setDriverFee(fee: number) {
      await prisma.platformSetting.upsert({
        where: { key: 'driver_trip_fee' },
        update: { value: fee },
        create: { key: 'driver_trip_fee', value: fee },
      });
    }

    it('creates a PENDING payout when a trip with an assigned driver completes', async () => {
      await setDriverFee(2000);
      const { tripId, driverId } = await createCompletedTrip({ withDriver: true });
      const payout = await prisma.driverTripPayout.findUnique({ where: { tripId } });
      expect(payout).not.toBeNull();
      expect(payout!.driverId).toBe(driverId);
      expect(payout!.status).toBe('PENDING');
      expect(Number(payout!.amount)).toBe(2000);
    });

    it('does not create a payout when the trip has no assigned driver', async () => {
      await setDriverFee(2000);
      const { tripId } = await createCompletedTrip({ withDriver: false });
      expect(await prisma.driverTripPayout.count({ where: { tripId } })).toBe(0);
    });

    it('does not create a payout when a trip is cancelled', async () => {
      await setDriverFee(2000);
      const operator = await createOperatorUser();
      const route = await prisma.route.create({
        data: { fromCity: 'Lilongwe', toCity: 'Zomba', basePrice: 10000, distanceKm: 250 },
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
          price: 15000,
        },
      });
      const tripId = tripRes.json().id as string;
      const cancel = await app.inject({
        method: 'PATCH',
        url: `/api/v1/trips/${tripId}/status`,
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: { status: 'CANCELLED' },
      });
      expect(cancel.statusCode).toBe(200);
      expect(await prisma.driverTripPayout.count({ where: { tripId } })).toBe(0);
    });

    it('creates only one payout per trip (idempotent on retry)', async () => {
      await setDriverFee(2000);
      const { operator, tripId } = await createCompletedTrip({ withDriver: true });
      const complete = await app.inject({
        method: 'PATCH',
        url: `/api/v1/trips/${tripId}/status`,
        headers: { authorization: `Bearer ${operator.accessToken}` },
        payload: { status: 'COMPLETED' },
      });
      expect(complete.statusCode).toBe(409);
      const count = await prisma.driverTripPayout.count({ where: { tripId } });
      expect(count).toBe(1);
    });

    it('GET /financial/driver-payouts lists payouts with filters', async () => {
      await setDriverFee(2000);
      const staff = await createStaffUser('SUPER_ADMIN');
      const { driverId } = await createCompletedTrip({ withDriver: true });
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/financial/driver-payouts?driverId=${driverId}&status=PENDING`,
        headers: { authorization: `Bearer ${staff.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBe(1);
      expect(res.json().items[0].amount.toString()).toBe('2000');
    });

    it('PATCH /financial/driver-payouts/:id/pay marks a payout paid (super admin)', async () => {
      await setDriverFee(2000);
      const superAdmin = await createStaffUser('SUPER_ADMIN');
      const { tripId } = await createCompletedTrip({ withDriver: true });
      const payout = await prisma.driverTripPayout.findUniqueOrThrow({ where: { tripId } });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/financial/driver-payouts/${payout.id}/pay`,
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('PAID');
      expect(res.json().paidAt).not.toBeNull();
    });

    it('PATCH /financial/driver-payouts/:id/pay rejects an already-paid payout', async () => {
      await setDriverFee(2000);
      const superAdmin = await createStaffUser('SUPER_ADMIN');
      const { tripId } = await createCompletedTrip({ withDriver: true });
      const payout = await prisma.driverTripPayout.findUniqueOrThrow({ where: { tripId } });
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/financial/driver-payouts/${payout.id}/pay`,
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
      });
      const second = await app.inject({
        method: 'PATCH',
        url: `/api/v1/financial/driver-payouts/${payout.id}/pay`,
        headers: { authorization: `Bearer ${superAdmin.accessToken}` },
      });
      expect(second.statusCode).toBe(409);
    });

    it('payout listing and payment are denied for financial-only and students', async () => {
      await setDriverFee(2000);
      const financial = await createStaffUser('FINANCIAL');
      const student = await createStudentUser();
      const listForFinancial = await app.inject({
        method: 'GET',
        url: '/api/v1/financial/driver-payouts',
        headers: { authorization: `Bearer ${financial.accessToken}` },
      });
      expect(listForFinancial.statusCode).toBe(200);
      const listForStudent = await app.inject({
        method: 'GET',
        url: '/api/v1/financial/driver-payouts',
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(listForStudent.statusCode).toBe(403);
      const payForFinancial = await app.inject({
        method: 'PATCH',
        url: `/api/v1/financial/driver-payouts/${'00000000-0000-4000-8000-000000000000'}/pay`,
        headers: { authorization: `Bearer ${financial.accessToken}` },
      });
      expect(payForFinancial.statusCode).toBe(403);
    });
  });
});
