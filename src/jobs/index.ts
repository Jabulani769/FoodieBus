import { startNotificationWorker } from './workers/notification.worker.js';
import {
  startBookingExpiryWorker,
  scheduleBookingExpiry,
} from './workers/booking-expiry.worker.js';
import {
  startPaymentExpiryWorker,
  schedulePaymentExpiry,
} from './workers/payment-expiry.worker.js';
import {
  startReconciliationWorker,
  scheduleReconciliation,
} from './workers/reconciliation.worker.js';
import { logger } from '../shared/logger/index.js';

export interface RunningWorkers {
  notification: ReturnType<typeof startNotificationWorker>;
  bookingExpiry: ReturnType<typeof startBookingExpiryWorker>;
  paymentExpiry: ReturnType<typeof startPaymentExpiryWorker>;
  reconciliation: ReturnType<typeof startReconciliationWorker>;
}

export function startWorkers(): RunningWorkers {
  const notification = startNotificationWorker();
  const bookingExpiry = startBookingExpiryWorker();
  const paymentExpiry = startPaymentExpiryWorker();
  const reconciliation = startReconciliationWorker();
  scheduleBookingExpiry();
  schedulePaymentExpiry();
  scheduleReconciliation();
  logger.info(
    'bullmq workers started (notifications, booking-expiry, payment-expiry, reconciliation)',
  );
  return { notification, bookingExpiry, paymentExpiry, reconciliation };
}

export async function stopWorkers(workers: RunningWorkers): Promise<void> {
  await Promise.allSettled([
    workers.notification.close(),
    workers.bookingExpiry.close(),
    workers.paymentExpiry.close(),
    workers.reconciliation.close(),
  ]);
}
