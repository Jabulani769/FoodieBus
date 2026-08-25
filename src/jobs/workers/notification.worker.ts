import { Worker } from 'bullmq';
import { prisma } from '../../shared/db/prisma.js';
import { logger } from '../../shared/logger/index.js';
import { NOTIFICATIONS_QUEUE } from '../queues.js';
import { createRedisConnection } from '../connection.js';
import { getProvider } from '../../modules/notifications/providers/index.js';
import type { Notification } from '../../generated/prisma/client.js';

async function sendPush(
  notification: Notification & { user: { phone: string | null; email: string | null } },
): Promise<void> {
  const tokens = await prisma.deviceToken.findMany({
    where: { userId: notification.userId, isActive: true },
    select: { token: true },
  });
  if (tokens.length === 0) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        metadata: { note: 'no active device tokens' },
      },
    });
    return;
  }

  const provider = getProvider('PUSH');
  let delivered = 0;
  for (const { token } of tokens) {
    try {
      const { messageId } = await provider.send({
        to: token,
        subject: notification.subject ?? undefined,
        body: notification.body,
      });
      delivered += 1;
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'SENT', sentAt: new Date(), metadata: { messageId } },
      });
    } catch (err) {
      logger.warn({ err, token }, 'push send failed for token');
    }
  }

  if (delivered === 0) {
    throw new Error('push failed for all device tokens');
  }
}

export function startNotificationWorker(): Worker {
  const worker = new Worker(
    NOTIFICATIONS_QUEUE,
    async (job) => {
      const { notificationId } = job.data as { notificationId: string };
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        include: { user: { select: { phone: true, email: true } } },
      });
      if (!notification) {
        logger.warn({ notificationId }, 'notification worker: row not found');
        return;
      }
      if (
        notification.status === 'SENT' ||
        notification.status === 'DELIVERED' ||
        notification.status === 'READ'
      ) {
        return;
      }

      if (notification.channel === 'PUSH') {
        await sendPush(notification);
        return;
      }

      const to =
        notification.channel === 'EMAIL' ? notification.user.email : notification.user.phone;
      const provider = getProvider(notification.channel);

      try {
        const { messageId } = await provider.send({
          to,
          subject: notification.subject ?? undefined,
          body: notification.body,
        });
        await prisma.notification.update({
          where: { id: notificationId },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            metadata: { messageId },
          },
        });
      } catch (err) {
        await prisma.notification.update({
          where: { id: notificationId },
          data: {
            status: 'FAILED',
            failureReason: err instanceof Error ? err.message : 'Unknown provider error',
          },
        });
        throw err; // let BullMQ retry, then mark failed after attempts are exhausted
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'notification job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err, queue: NOTIFICATIONS_QUEUE }, 'notification worker redis error');
  });

  return worker;
}
