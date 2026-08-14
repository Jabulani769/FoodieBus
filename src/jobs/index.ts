import { startNotificationWorker } from './workers/notification.worker.js';
import {
  startBookingExpiryWorker,
  scheduleBookingExpiry,
} from './workers/booking-expiry.worker.js';
import { logger } from '../shared/logger/index.js';

export interface RunningWorkers {
  notification: ReturnType<typeof startNotificationWorker>;
  bookingExpiry: ReturnType<typeof startBookingExpiryWorker>;
}

export function startWorkers(): RunningWorkers {
  const notification = startNotificationWorker();
  const bookingExpiry = startBookingExpiryWorker();
  scheduleBookingExpiry();
  logger.info('bullmq workers started (notifications, booking-expiry)');
  return { notification, bookingExpiry };
}

export async function stopWorkers(workers: RunningWorkers): Promise<void> {
  await Promise.allSettled([workers.notification.close(), workers.bookingExpiry.close()]);
}
