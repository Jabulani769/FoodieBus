import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { paychangu } from './paychangu.js';
import { busService } from '../bus/bus.service.js';
import { generateReceiptPdf } from './receipt.js';
import { notificationService } from '../notifications/notification.service.js';

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'FINANCIAL' | 'VENDOR' | 'OPERATOR' | 'STUDENT';

export class PaymentService {
  async createPayment(
    userId: string,
    bookingId: string,
  ): Promise<{
    id: string;
    txRef: string;
    checkoutUrl: string;
    amount: string;
    currency: string;
    status: string;
  }> {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw AppError.notFound('Booking not found');
    if (booking.passengerId !== userId) {
      throw AppError.forbidden('You can only pay for your own bookings');
    }
    if (booking.status !== 'PENDING') {
      throw AppError.conflict(`Booking is ${booking.status.toLowerCase()} and cannot be paid`);
    }

    const txRef = `FB-${randomUUID()}`;
    const firstName = booking.passengerName.split(' ')[0] ?? booking.passengerName;
    const lastName = booking.passengerName.split(' ').slice(1).join(' ') || undefined;

    const { checkoutUrl } = await paychangu.initiate({
      amount: Number(booking.totalAmount),
      currency: 'MWK',
      txRef,
      firstName,
      lastName,
      meta: { bookingId: booking.id, passengerId: booking.passengerId },
    });

    const payment = await prisma.payment.create({
      data: {
        bookingId,
        txRef,
        amount: booking.totalAmount,
        currency: 'MWK',
        status: 'PENDING',
        checkoutUrl,
        meta: { bookingId: booking.id, passengerId: booking.passengerId },
      },
    });

    return {
      id: payment.id,
      txRef: payment.txRef,
      checkoutUrl: payment.checkoutUrl ?? '',
      amount: payment.amount.toString(),
      currency: payment.currency,
      status: payment.status,
    };
  }

  // Shared by the webhook (no actor) and the manual re-verify endpoint.
  async verifyAndConfirm(txRef: string): Promise<unknown> {
    const payment = await prisma.payment.findUnique({ where: { txRef } });
    if (!payment) throw AppError.notFound('Payment not found');
    if (payment.status === 'PAID' || payment.status === 'REFUNDED') {
      return this.getPaymentById(payment.id);
    }

    const result = await paychangu.verify(txRef);
    const amountMatches = result.amount === Number(payment.amount);
    const currencyMatches = (result.currency ?? payment.currency) === payment.currency;

    if (result.status === 'success' && amountMatches && currencyMatches) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          channel: result.channel ?? null,
          provider: result.provider ?? null,
          charges: result.charges ?? null,
          paychanguReference: result.reference ?? null,
        },
      });
      try {
        await busService.confirmBooking(payment.bookingId);
      } catch (err) {
        if (err instanceof AppError && (err.code === 'CONFLICT' || err.code === 'NOT_FOUND')) {
          // Booking already confirmed/cancelled by another attempt — payment is still recorded.
        } else {
          throw err;
        }
      }

      const confirmedBooking = await prisma.booking.findUnique({
        where: { id: payment.bookingId },
        include: {
          trip: { include: { route: { select: { fromCity: true, toCity: true } } } },
          seat: { select: { seatNumber: true } },
        },
      });
      if (confirmedBooking) {
        await notificationService.notifyUser(
          confirmedBooking.passengerId,
          'Booking confirmed',
          `Your booking ${confirmedBooking.passengerName} for ${confirmedBooking.trip.route.fromCity} → ${confirmedBooking.trip.route.toCity} (seat ${confirmedBooking.seat.seatNumber}) is confirmed. Payment received via ${result.channel ?? 'PayChangu'}.`,
          { reference: confirmedBooking.id, referenceType: 'booking' },
        );
      }
    } else {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
    }

    return this.getPaymentById(payment.id);
  }

  async listByPassenger(passengerId: string): Promise<{ items: unknown[] }> {
    const items = await prisma.payment.findMany({
      where: { booking: { passengerId } },
      include: {
        booking: {
          include: {
            trip: {
              include: {
                route: { select: { fromCity: true, toCity: true } },
                operator: { select: { businessName: true } },
              },
            },
            seat: { select: { seatNumber: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { items };
  }

  async getPaymentById(id: string): Promise<unknown> {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            trip: {
              include: {
                route: { select: { fromCity: true, toCity: true } },
                operator: { select: { businessName: true } },
              },
            },
            seat: { select: { seatNumber: true } },
          },
        },
      },
    });
    if (!payment) throw AppError.notFound('Payment not found');
    return payment;
  }

  async assertCanView(
    payment: { booking: { passengerId: string } },
    userId: string,
    role: Role,
  ): Promise<void> {
    const isStaff = role === 'FINANCIAL' || role === 'ADMIN' || role === 'SUPER_ADMIN';
    if (!isStaff && payment.booking.passengerId !== userId) {
      throw AppError.forbidden('You can only view your own payments');
    }
  }

  async generateReceipt(
    paymentId: string,
    viewer: { id: string; role: Role },
  ): Promise<{ buffer: Buffer; filename: string }> {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        booking: {
          include: {
            trip: {
              include: {
                route: { select: { fromCity: true, toCity: true } },
                operator: { select: { businessName: true } },
              },
            },
            seat: { select: { seatNumber: true } },
            passenger: { select: { email: true } },
          },
        },
      },
    });
    if (!payment) throw AppError.notFound('Payment not found');
    if (payment.status !== 'PAID') {
      throw AppError.conflict('Receipt is only available for paid payments');
    }
    await this.assertCanView(
      payment as unknown as { booking: { passengerId: string } },
      viewer.id,
      viewer.role,
    );

    const booking = payment.booking;
    const buffer = await generateReceiptPdf({
      receiptNumber: payment.txRef,
      paidAt: payment.paidAt ?? new Date(),
      paymentMethod: payment.channel ?? 'PayChangu',
      txRef: payment.txRef,
      passengerName: booking.passengerName,
      passengerPhone: booking.passengerPhone,
      route: `${booking.trip.route.fromCity} → ${booking.trip.route.toCity}`,
      departureTime: booking.trip.departureTime,
      seatNumber: booking.seat.seatNumber,
      operator: booking.trip.operator.businessName,
      amount: Number(payment.amount),
      currency: payment.currency,
      charges: payment.charges ? Number(payment.charges) : null,
    });
    return { buffer, filename: `receipt-${payment.txRef}.pdf` };
  }
}

export const paymentService = new PaymentService();
