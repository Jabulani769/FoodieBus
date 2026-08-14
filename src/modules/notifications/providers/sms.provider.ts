import { randomUUID } from 'node:crypto';
import { env } from '../../../shared/config/env.js';
import { logger } from '../../../shared/logger/index.js';
import type { NotificationProvider } from './types.js';

export class SmsProvider implements NotificationProvider {
  readonly name = 'sms';

  async send(params: { to: string; body: string }): Promise<{ messageId: string }> {
    if (env.SMS_PROVIDER !== 'africastalking' || !env.SMS_API_KEY) {
      logger.info({ to: params.to, body: params.body }, 'sms (mock)');
      return { messageId: `mock-sms-${randomUUID()}` };
    }
    // TODO: wire Africa's Talking SMS API here.
    throw new Error("Africa's Talking SMS provider not implemented yet");
  }
}
