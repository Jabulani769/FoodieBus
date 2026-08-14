import { randomUUID } from 'node:crypto';
import { env } from '../../../shared/config/env.js';
import { logger } from '../../../shared/logger/index.js';
import type { NotificationProvider } from './types.js';

export class EmailProvider implements NotificationProvider {
  readonly name = 'email';

  async send(params: {
    to: string;
    subject?: string;
    body: string;
  }): Promise<{ messageId: string }> {
    if (env.EMAIL_PROVIDER !== 'resend' && env.EMAIL_PROVIDER !== 'smtp') {
      logger.info({ to: params.to, subject: params.subject, body: params.body }, 'email (mock)');
      return { messageId: `mock-email-${randomUUID()}` };
    }
    // TODO: wire Resend / SMTP here.
    throw new Error('Resend/SMTP email provider not implemented yet');
  }
}
