import { Worker } from 'bullmq';
import { logger } from '../../shared/logger/index.js';
import { bookingExpiryQueue, BOOKING_EXPIRY_QUEUE, BOOKING_EXPIRY_JOB } from '../queues.js';
import { createRedisConnection } from '../connection.js';
import { expireStaleBookings } from '../../modules/notifications/booking-expiry.service.js';

const EXPIRY_INTERVAL_MS = 60_000;

export function startBookingExpiryWorker(): Worker {
  const worker = new Worker(
    BOOKING_EXPIRY_QUEUE,
    async () => {
      const expired = await expireStaleBookings();
      if (expired > 0) {
        logger.info({ expired }, 'booking-expiry worker: expired stale bookings');
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'booking-expiry job failed');
  });

  return worker;
}

export function scheduleBookingExpiry(): void {
  void bookingExpiryQueue.upsertJobScheduler(
    BOOKING_EXPIRY_JOB,
    { every: EXPIRY_INTERVAL_MS },
    { name: BOOKING_EXPIRY_JOB, data: {} },
  );
}
