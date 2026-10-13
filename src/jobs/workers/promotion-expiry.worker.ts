import { Worker } from 'bullmq';
import { logger } from '../../shared/logger/index.js';
import { promotionExpiryQueue, PROMOTION_EXPIRY_QUEUE, PROMOTION_EXPIRY_JOB } from '../queues.js';
import { createRedisConnection } from '../connection.js';
import { promotionService } from '../../modules/promotions/promotion.service.js';

const EXPIRY_INTERVAL_MS = 15 * 60_000;

export function startPromotionExpiryWorker(): Worker {
  const worker = new Worker(
    PROMOTION_EXPIRY_QUEUE,
    async () => {
      const expired = await promotionService.expireDue();
      if (expired > 0) {
        logger.info({ expired }, 'promotion-expiry worker: expired promotions');
      }
    },
    { connection: createRedisConnection(), concurrency: 1 },
  );
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'promotion-expiry job failed');
  });
  worker.on('error', (err) => {
    logger.error({ err, queue: PROMOTION_EXPIRY_QUEUE }, 'promotion-expiry worker redis error');
  });
  return worker;
}

export function schedulePromotionExpiry(): void {
  promotionExpiryQueue
    .upsertJobScheduler(
      PROMOTION_EXPIRY_JOB,
      { every: EXPIRY_INTERVAL_MS },
      { name: PROMOTION_EXPIRY_JOB, data: {} },
    )
    .catch((err) =>
      logger.error({ err, queue: PROMOTION_EXPIRY_QUEUE }, 'promotion-expiry scheduler failed'),
    );
}
