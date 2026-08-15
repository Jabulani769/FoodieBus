import { randomUUID } from 'node:crypto';
import { env } from '../../../shared/config/env.js';
import { logger } from '../../../shared/logger/index.js';
import type { NotificationProvider } from './types.js';

interface AfricasTalkingResponse {
  SMSMessageData?: {
    Message?: string;
    Recipients?: {
      status?: string;
      statusCode?: number;
      number?: string;
      messageId?: string;
    }[];
  };
}

export class SmsProvider implements NotificationProvider {
  readonly name = 'sms';

  async send(params: { to: string; body: string }): Promise<{ messageId: string }> {
    if (env.SMS_PROVIDER !== 'africastalking' || !env.SMS_API_KEY) {
      logger.info({ to: params.to, body: params.body }, 'sms (mock)');
      return { messageId: `mock-sms-${randomUUID()}` };
    }
    if (!env.SMS_API_USERNAME) {
      throw new Error("Africa's Talking SMS provider requires SMS_API_USERNAME");
    }

    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        apiKey: env.SMS_API_KEY,
      },
      body: new URLSearchParams({
        username: env.SMS_API_USERNAME,
        to: params.to,
        message: params.body,
        from: env.SMS_SENDER_ID,
      }).toString(),
    });

    const json = (await res.json()) as AfricasTalkingResponse;
    const recipient = json.SMSMessageData?.Recipients?.[0];

    if (!res.ok || !recipient || recipient.status !== 'Success' || !recipient.messageId) {
      const detail = recipient?.status ?? json.SMSMessageData?.Message ?? `HTTP ${res.status}`;
      throw new Error(`Africa's Talking SMS send failed: ${detail}`);
    }

    return { messageId: recipient.messageId };
  }
}
