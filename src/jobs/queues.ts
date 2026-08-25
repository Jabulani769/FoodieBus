import { Queue } from 'bullmq';
import { createRedisConnection } from './connection.js';
import { logger } from '../shared/logger/index.js';

export const NOTIFICATIONS_QUEUE = 'notifications';
export const BOOKING_EXPIRY_QUEUE = 'booking-expiry';
export const PAYMENT_EXPIRY_QUEUE = 'payment-expiry';
export const RECONCILIATION_QUEUE = 'reconciliation';

export const SEND_NOTIFICATION_JOB = 'send-notification';
export const BOOKING_EXPIRY_JOB = 'run-booking-expiry';
export const PAYMENT_EXPIRY_JOB = 'run-payment-expiry';
export const RECONCILIATION_JOB = 'run-reconciliation';

function createQueue(name: string): Queue {
  const queue = new Queue(name, { connection: createRedisConnection() });
  queue.on('error', (err) => {
    logger.error({ err, queue: name }, `${name} queue redis error`);
  });
  return queue;
}

export const notificationsQueue = createQueue(NOTIFICATIONS_QUEUE);
export const bookingExpiryQueue = createQueue(BOOKING_EXPIRY_QUEUE);
export const paymentExpiryQueue = createQueue(PAYMENT_EXPIRY_QUEUE);
export const reconciliationQueue = createQueue(RECONCILIATION_QUEUE);
