import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma.js';
import { createUser } from '../auth/auth.service.js';
import { env } from '../../shared/config/env.js';

vi.mock('./paychangu.js', () => ({
  paychangu: {
    initiate: vi.fn(),
    verify: vi.fn(),
  },
}));

import { paychangu } from './paychangu.js';

const mockedInitiate = vi.mocked(paychangu.initiate);
const mockedVerify = vi.mocked(paychangu.verify);

function webhookSignature(payload: unknown): string {
  const raw = JSON.stringify(payload);
  return createHmac('sha256', env.PAYCHANGU_WEBHOOK_SECRET!).update(raw).digest('hex');
}

describe('payments module', () => {
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
      checkoutUrl: 'https://checkout.test/fb-default',
      txRef: `FB-${Math.random().toString(36).slice(2, 10)}`,
    });
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

  describe('Initiate payment', () => {
    it('POST /payments creates a PENDING payment and returns a checkout URL', async () => {
      mockedInitiate.mockResolvedValue({
        checkoutUrl: 'https://checkout.test/fb-1',
        txRef: 'FB-x',
      });
      const student = await createStudentUser();
      const { bookingId } = await createBookingFor(student);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().checkoutUrl).toBe('https://checkout.test/fb-1');
      expect(res.json().status).toBe('PENDING');
      expect(res.json().amount).toBe('18000');
      const payment = await prisma.payment.findUnique({ where: { id: res.json().id } });
      expect(payment?.status).toBe('PENDING');
      expect(payment?.bookingId).toBe(bookingId);
    });

    it('POST /payments forbids paying for another user booking', async () => {
      const studentA = await createStudentUser('A');
      const studentB = await createStudentUser('B');
      const { bookingId } = await createBookingFor(studentA);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${studentB.accessToken}` },
        payload: { bookingId },
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /payments rejects a booking that is already paid/confirmed', async () => {
      const student = await createStudentUser();
      const { bookingId } = await createBookingFor(student);
      await prisma.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId },
      });
      expect(res.statusCode).toBe(409);
    });

    it('POST /payments requires authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        payload: { bookingId: crypto.randomUUID() },
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /payments propagates a PayChangu initiation failure', async () => {
      mockedInitiate.mockRejectedValue(new Error('boom'));
      const student = await createStudentUser();
      const { bookingId } = await createBookingFor(student);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('Webhook', () => {
    it('confirms the booking and marks the payment PAID on a successful webhook', async () => {
      mockedVerify.mockResolvedValue({
        status: 'success',
        amount: 18000,
        currency: 'MWK',
        charges: 360,
        reference: 'PC-123',
        channel: 'Mobile Money',
        provider: 'Airtel Money',
      });
      const student = await createStudentUser();
      const { bookingId } = await createBookingFor(student);
      const init = await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId },
      });
      const txRef = init.json().txRef as string;

      const payload = { event: 'checkout.payment', tx_ref: txRef, status: 'success' };
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/paychangu',
        headers: { signature: webhookSignature(payload) },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const payment = await prisma.payment.findUnique({ where: { txRef } });
      expect(payment?.status).toBe('PAID');
      expect(payment?.paidAt).not.toBeNull();
      expect(payment?.charges?.toString()).toBe('360');
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      expect(booking?.status).toBe('CONFIRMED');
      const seat = await prisma.seatInventory.findFirst({
        where: { tripId: booking!.tripId, seatNumber: '1' },
      });
      expect(seat?.status).toBe('BOOKED');
    });

    it('rejects a webhook with an invalid signature', async () => {
      const payload = { event: 'checkout.payment', tx_ref: 'FB-nope', status: 'success' };
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/paychangu',
        headers: { signature: 'deadbeef' },
        payload,
      });
      expect(res.statusCode).toBe(401);
    });

    it('marks the payment FAILED when verification amount does not match', async () => {
      mockedVerify.mockResolvedValue({
        status: 'success',
        amount: 500, // tampered amount
        currency: 'MWK',
      });
      const student = await createStudentUser();
      const { bookingId } = await createBookingFor(student);
      const init = await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId },
      });
      const txRef = init.json().txRef as string;
      const payload = { event: 'checkout.payment', tx_ref: txRef, status: 'success' };
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/paychangu',
        headers: { signature: webhookSignature(payload) },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const payment = await prisma.payment.findUnique({ where: { txRef } });
      expect(payment?.status).toBe('FAILED');
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      expect(booking?.status).toBe('PENDING');
    });

    it('is idempotent — a duplicate successful webhook stays PAID', async () => {
      mockedVerify.mockResolvedValue({ status: 'success', amount: 18000, currency: 'MWK' });
      const student = await createStudentUser();
      const { bookingId } = await createBookingFor(student);
      const init = await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId },
      });
      const txRef = init.json().txRef as string;
      const payload = { event: 'checkout.payment', tx_ref: txRef, status: 'success' };
      const headers = { signature: webhookSignature(payload) };
      const first = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/paychangu',
        headers,
        payload,
      });
      expect(first.statusCode).toBe(200);
      const second = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/paychangu',
        headers,
        payload,
      });
      expect(second.statusCode).toBe(200);
      const payments = await prisma.payment.findMany({ where: { txRef } });
      expect(payments.length).toBe(1);
      expect(payments[0]?.status).toBe('PAID');
    });
  });

  describe('Manual verify + receipt', () => {
    it('POST /payments/:id/verify confirms the booking (backup to webhook)', async () => {
      mockedVerify.mockResolvedValue({ status: 'success', amount: 18000, currency: 'MWK' });
      const student = await createStudentUser();
      const { bookingId } = await createBookingFor(student);
      const init = await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId },
      });
      const paymentId = init.json().id as string;
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/payments/${paymentId}/verify`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('PAID');
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      expect(booking?.status).toBe('CONFIRMED');
    });

    it('GET /payments/me lists own payments', async () => {
      const student = await createStudentUser();
      const { bookingId } = await createBookingFor(student);
      await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId },
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/payments/me',
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(1);
    });

    it('GET /payments/:id forbids another user', async () => {
      const studentA = await createStudentUser('A');
      const studentB = await createStudentUser('B');
      const { bookingId } = await createBookingFor(studentA);
      const init = await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${studentA.accessToken}` },
        payload: { bookingId },
      });
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/payments/${init.json().id}`,
        headers: { authorization: `Bearer ${studentB.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('GET /payments/:id/receipt returns a PDF for a paid payment', async () => {
      mockedVerify.mockResolvedValue({ status: 'success', amount: 18000, currency: 'MWK' });
      const student = await createStudentUser();
      const { bookingId } = await createBookingFor(student);
      const init = await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId },
      });
      const paymentId = init.json().id as string;
      await app.inject({
        method: 'POST',
        url: `/api/v1/payments/${paymentId}/verify`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/payments/${paymentId}/receipt`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect((res.rawPayload as Buffer).length).toBeGreaterThan(100);
    });

    it('GET /payments/:id/receipt is rejected for an unpaid payment', async () => {
      const student = await createStudentUser();
      const { bookingId } = await createBookingFor(student);
      const init = await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${student.accessToken}` },
        payload: { bookingId },
      });
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/payments/${init.json().id}/receipt`,
        headers: { authorization: `Bearer ${student.accessToken}` },
      });
      expect(res.statusCode).toBe(409);
    });
  });
});
