import { Worker } from 'bullmq';
import { logger } from '../../shared/logger/index.js';
import { reconciliationQueue, RECONCILIATION_QUEUE, RECONCILIATION_JOB } from '../queues.js';
import { createRedisConnection } from '../connection.js';
import { prisma } from '../../shared/db/prisma.js';
import { paychangu } from '../../modules/payments/paychangu.js';

const RECONCILE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function runReconciliation(): Promise<number> {
  const since = new Date(Date.now() - RECONCILE_WINDOW_MS);
  const paid = await prisma.payment.findMany({
    where: { status: 'PAID', paidAt: { gte: since } },
    select: { id: true, txRef: true, status: true },
  });

  let mismatches = 0;
  for (const payment of paid) {
    try {
      const result = await paychangu.verify(payment.txRef);
      if (result.status !== 'success') {
        const existing = await prisma.reconciliationMismatch.findFirst({
          where: { paymentId: payment.id, resolved: false },
        });
        if (!existing) {
          await prisma.reconciliationMismatch.create({
            data: {
              paymentId: payment.id,
              localStatus: payment.status,
              remoteStatus: result.status,
            },
          });
          mismatches += 1;
        }
      }
    } catch {
      // Gateway error — skip; the next run will retry.
    }
  }

  return mismatches;
}

export function startReconciliationWorker(): Worker {
  const worker = new Worker(
    RECONCILIATION_QUEUE,
    async () => {
      const mismatches = await runReconciliation();
      if (mismatches > 0) {
        logger.info({ mismatches }, 'reconciliation worker: flagged payment mismatches');
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'reconciliation job failed');
  });

  return worker;
}

export function scheduleReconciliation(): void {
  void reconciliationQueue.upsertJobScheduler(
    RECONCILIATION_JOB,
    { every: RECONCILE_INTERVAL_MS },
    { name: RECONCILIATION_JOB, data: {} },
  );
}
