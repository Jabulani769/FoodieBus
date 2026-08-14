import { createHash, randomInt } from 'node:crypto';
import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { env } from '../../shared/config/env.js';
import { logger } from '../../shared/logger/index.js';
import { notificationsQueue } from '../../jobs/queues.js';
import { SEND_NOTIFICATION_JOB } from '../../jobs/queues.js';
import type { NotificationChannel, NotificationStatus } from '../../generated/prisma/enums.js';

export const OTP_PURPOSE_PASSWORD_RESET = 'password_reset';
export const OTP_PURPOSE_INVITE = 'invite';

export type OtpPurpose = 'password_reset' | 'invite';

interface SendOptions {
  reference?: string;
  referenceType?: string;
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function otpTtlMs(): number {
  return env.OTP_TTL_MINUTES * 60 * 1000;
}

export class NotificationService {
  async send(
    userId: string,
    channel: NotificationChannel,
    subject: string | undefined,
    body: string,
    opts: SendOptions = {},
  ): Promise<{ id: string; status: NotificationStatus }> {
    const notification = await prisma.notification.create({
      data: {
        userId,
        channel,
        subject,
        body,
        reference: opts.reference ?? null,
        referenceType: opts.referenceType ?? null,
      },
      select: { id: true, status: true },
    });

    try {
      await notificationsQueue.add(
        SEND_NOTIFICATION_JOB,
        { notificationId: notification.id },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    } catch (err) {
      logger.error({ err, notificationId: notification.id }, 'failed to enqueue notification job');
    }

    return notification;
  }

  // Best-effort: sends on every channel the user has enabled. Never throws.
  async notifyUser(
    userId: string,
    subject: string,
    body: string,
    opts: SendOptions = {},
  ): Promise<void> {
    try {
      const pref = await this.getPreference(userId);
      const channels: NotificationChannel[] = [];
      if (pref.sms) channels.push('SMS');
      if (pref.whatsapp) channels.push('WHATSAPP');
      if (pref.email) channels.push('EMAIL');

      for (const channel of channels) {
        await this.send(userId, channel, subject, body, opts);
      }
    } catch (err) {
      logger.error({ err, userId }, 'notifyUser failed (best-effort)');
    }
  }

  async sendOtp(userId: string, purpose: OtpPurpose): Promise<void> {
    const code = generateCode();
    await prisma.otpCode.create({
      data: {
        userId,
        code: hashCode(code),
        purpose,
        expiresAt: new Date(Date.now() + otpTtlMs()),
        maxAttempts: 5,
      },
    });

    const message =
      purpose === OTP_PURPOSE_INVITE
        ? `Welcome to FoodieBus! Your verification code is ${code}. It expires in ${env.OTP_TTL_MINUTES} minutes.`
        : `Your FoodieBus password reset code is ${code}. It expires in ${env.OTP_TTL_MINUTES} minutes.`;

    // Critical flows (password reset / invite) always go out on SMS + email.
    for (const channel of ['SMS', 'EMAIL'] as const) {
      await this.send(userId, channel, 'FoodieBus verification code', message, {
        referenceType: purpose,
      });
    }
  }

  async verifyOtp(userId: string, purpose: OtpPurpose, code: string): Promise<void> {
    const latest = await prisma.otpCode.findFirst({
      where: { userId, purpose },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest || latest.usedAt !== null) {
      throw AppError.unauthorized('Invalid or expired code');
    }
    if (latest.attempts >= latest.maxAttempts) {
      throw AppError.unauthorized('Too many attempts. Request a new code');
    }
    if (latest.expiresAt < new Date()) {
      throw AppError.unauthorized('Code has expired');
    }

    const match = hashCode(code) === latest.code;
    if (!match) {
      await prisma.otpCode.update({
        where: { id: latest.id },
        data: { attempts: { increment: 1 } },
      });
      throw AppError.unauthorized('Invalid code');
    }

    await prisma.otpCode.update({
      where: { id: latest.id },
      data: { usedAt: new Date(), attempts: { increment: 1 } },
    });
  }

  async listByUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: unknown[]; total: number }> {
    const where = { userId };
    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);
    return { items, total };
  }

  async markRead(notificationId: string, userId: string): Promise<{ id: string }> {
    const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) throw AppError.notFound('Notification not found');
    if (notification.userId !== userId) {
      throw AppError.forbidden('You can only read your own notifications');
    }
    return prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'READ' },
      select: { id: true },
    });
  }

  async getPreference(userId: string): Promise<{
    sms: boolean;
    whatsapp: boolean;
    email: boolean;
  }> {
    const existing = await prisma.notificationPreference.findUnique({ where: { userId } });
    if (existing) {
      return { sms: existing.sms, whatsapp: existing.whatsapp, email: existing.email };
    }
    return { sms: true, whatsapp: true, email: true };
  }

  async updatePreference(
    userId: string,
    prefs: { sms?: boolean; whatsapp?: boolean; email?: boolean },
  ): Promise<{ sms: boolean; whatsapp: boolean; email: boolean }> {
    const current = await this.getPreference(userId);
    const next = { ...current, ...prefs };
    if (!next.sms && !next.whatsapp && !next.email) {
      throw AppError.validation('At least one notification channel must remain enabled');
    }
    await prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...next },
      update: next,
    });
    return next;
  }
}

export const notificationService = new NotificationService();
