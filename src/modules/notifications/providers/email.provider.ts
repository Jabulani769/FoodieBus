import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { env } from '../../../shared/config/env.js';
import { logger } from '../../../shared/logger/index.js';
import type { NotificationProvider } from './types.js';

interface ResendError {
  error?: { message?: string };
}

interface ResendSuccess {
  id?: string;
}

export class EmailProvider implements NotificationProvider {
  readonly name = 'email';

  async send(params: {
    to: string;
    subject?: string;
    body: string;
  }): Promise<{ messageId: string }> {
    if (env.EMAIL_PROVIDER === 'resend' && env.EMAIL_API_KEY) {
      return this.sendViaResend(params);
    }
    if (env.EMAIL_PROVIDER === 'smtp' && env.SMTP_HOST) {
      return this.sendViaSmtp(params);
    }
    logger.info({ to: params.to, subject: params.subject, body: params.body }, 'email (mock)');
    return { messageId: `mock-email-${randomUUID()}` };
  }

  private async sendViaResend(params: {
    to: string;
    subject?: string;
    body: string;
  }): Promise<{ messageId: string }> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [params.to],
        subject: params.subject ?? 'FoodieBus',
        text: params.body,
      }),
    });

    const json = (await res.json()) as ResendError & ResendSuccess;
    if (!res.ok || json.error || !json.id) {
      const detail = json.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`Resend email send failed: ${detail}`);
    }

    return { messageId: json.id };
  }

  private async sendViaSmtp(params: {
    to: string;
    subject?: string;
    body: string;
  }): Promise<{ messageId: string }> {
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
    });

    try {
      const info = await transporter.sendMail({
        from: env.EMAIL_FROM,
        to: params.to,
        subject: params.subject ?? 'FoodieBus',
        text: params.body,
      });
      return { messageId: info.messageId };
    } finally {
      transporter.close();
    }
  }
}
