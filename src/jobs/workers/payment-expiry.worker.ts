import { Worker } from 'bullmq';
import { logger } from '../../shared/logger/index.js';
import { paymentExpiryQueue, PAYMENT_EXPIRY_QUEUE, PAYMENT_EXPIRY_JOB } from '../queues.js';
import { createRedisConnection } from '../connection.js';
import { prisma } from '../../shared/db/prisma.js';
import { busService } from '../../modules/bus/bus.service.js';
import { paychangu } from '../../modules/payments/paychangu.js';
import { env } from '../../shared/config/env.js';

const EXPIRY_INTERVAL_MS = 60_000;

export async function expireStalePayments(): Promise<number> {
  const cutoff = new Date(Date.now() - env.BOOKING_HOLD_MINUTES * 60 * 1000);
  const stale = await prisma.payment.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoff },
    },
    select: { id: true, bookingId: true, txRef: true, amount: true },
  });

  let expired = 0;
  for (const payment of stale) {
    // Verify with the gateway BEFORE releasing any inventory. If the customer
    // actually paid, confirm the booking instead of expiring it.
    let verified: Awaited<ReturnType<typeof paychangu.verify>>;
    try {
      verified = await paychangu.verify(payment.txRef);
    } catch (err) {
      logger.warn(
        { paymentId: payment.id, err },
        'payment-expiry worker: gateway verify failed, deferring expiry',
      );
      continue;
    }
    if (verified.status === 'success' && verified.amount === Number(payment.amount)) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID', paidAt: new Date() },
      });
      try {
        await busService.confirmBooking(payment.bookingId);
      } catch (err) {
        logger.warn(
          { paymentId: payment.id, bookingId: payment.bookingId, err },
          'payment-expiry worker: payment confirmed at gateway but booking could not be confirmed',
        );
      }
      continue;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: payment.bookingId },
      select: { status: true },
    });
    if (!booking) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      expired += 1;
      continue;
    }
    if (booking.status !== 'PENDING') {
      // The booking was already expired/confirmed/cancelled elsewhere — mark the
      // orphaned payment failed so it leaves the PENDING base.
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      expired += 1;
      continue;
    }
    // Booking still pending past the hold period and the gateway confirms it was
    // not paid — expire it to release the seat, then fail the payment.
    await busService.expireBooking(payment.bookingId);
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    expired += 1;
  }

  return expired;
}

export function startPaymentExpiryWorker(): Worker {
  const worker = new Worker(
    PAYMENT_EXPIRY_QUEUE,
    async () => {
      const expired = await expireStalePayments();
      if (expired > 0) {
        logger.info({ expired }, 'payment-expiry worker: expired stale payments');
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'payment-expiry job failed');
  });

  return worker;
}

export function schedulePaymentExpiry(): void {
  void paymentExpiryQueue.upsertJobScheduler(
    PAYMENT_EXPIRY_JOB,
    { every: EXPIRY_INTERVAL_MS },
    { name: PAYMENT_EXPIRY_JOB, data: {} },
  );
}
