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
import { queueJobsGauge } from '../shared/metrics/index.js';
import {
  notificationsQueue,
  bookingExpiryQueue,
  paymentExpiryQueue,
  reconciliationQueue,
} from './queues.js';

export interface RunningWorkers {
  notification: ReturnType<typeof startNotificationWorker>;
  bookingExpiry: ReturnType<typeof startBookingExpiryWorker>;
  paymentExpiry: ReturnType<typeof startPaymentExpiryWorker>;
  reconciliation: ReturnType<typeof startReconciliationWorker>;
  metricsTimer?: NodeJS.Timeout;
}

const QUEUES = [notificationsQueue, bookingExpiryQueue, paymentExpiryQueue, reconciliationQueue];

async function refreshQueueMetrics(): Promise<void> {
  for (const queue of QUEUES) {
    try {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
        'completed',
      );
      for (const [status, count] of Object.entries(counts)) {
        queueJobsGauge.set({ queue: queue.name, status }, count ?? 0);
      }
    } catch (err) {
      logger.warn({ err, queue: queue.name }, 'failed to refresh queue metrics');
    }
  }
}

export function startWorkers(): RunningWorkers {
  const notification = startNotificationWorker();
  const bookingExpiry = startBookingExpiryWorker();
  const paymentExpiry = startPaymentExpiryWorker();
  const reconciliation = startReconciliationWorker();
  scheduleBookingExpiry();
  schedulePaymentExpiry();
  scheduleReconciliation();
  const metricsTimer = setInterval(() => void refreshQueueMetrics(), 30_000);
  metricsTimer.unref();
  logger.info(
    'bullmq workers started (notifications, booking-expiry, payment-expiry, reconciliation)',
  );
  return { notification, bookingExpiry, paymentExpiry, reconciliation, metricsTimer };
}

export async function stopWorkers(workers: RunningWorkers): Promise<void> {
  if (workers.metricsTimer) clearInterval(workers.metricsTimer);
  await Promise.allSettled([
    workers.notification.close(),
    workers.bookingExpiry.close(),
    workers.paymentExpiry.close(),
    workers.reconciliation.close(),
  ]);
}
