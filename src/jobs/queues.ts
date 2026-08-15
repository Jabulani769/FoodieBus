import { Queue } from 'bullmq';
import { createRedisConnection } from './connection.js';

export const NOTIFICATIONS_QUEUE = 'notifications';
export const BOOKING_EXPIRY_QUEUE = 'booking-expiry';
export const PAYMENT_EXPIRY_QUEUE = 'payment-expiry';
export const RECONCILIATION_QUEUE = 'reconciliation';

export const SEND_NOTIFICATION_JOB = 'send-notification';
export const BOOKING_EXPIRY_JOB = 'run-booking-expiry';
export const PAYMENT_EXPIRY_JOB = 'run-payment-expiry';
export const RECONCILIATION_JOB = 'run-reconciliation';

export const notificationsQueue = new Queue(NOTIFICATIONS_QUEUE, {
  connection: createRedisConnection(),
});

export const bookingExpiryQueue = new Queue(BOOKING_EXPIRY_QUEUE, {
  connection: createRedisConnection(),
});

export const paymentExpiryQueue = new Queue(PAYMENT_EXPIRY_QUEUE, {
  connection: createRedisConnection(),
});

export const reconciliationQueue = new Queue(RECONCILIATION_QUEUE, {
  connection: createRedisConnection(),
});
