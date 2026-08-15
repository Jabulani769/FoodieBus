import { randomUUID } from 'node:crypto';
import { env } from '../../../shared/config/env.js';
import { logger } from '../../../shared/logger/index.js';
import type { NotificationProvider } from './types.js';

interface MetaError {
  error?: { message?: string; code?: number; type?: string };
}

interface MetaSuccess {
  messages?: { id?: string }[];
}

export class WhatsAppProvider implements NotificationProvider {
  readonly name = 'whatsapp';

  async send(params: { to: string; body: string }): Promise<{ messageId: string }> {
    if (
      env.WHATSAPP_PROVIDER !== 'meta' ||
      !env.WHATSAPP_API_TOKEN ||
      !env.WHATSAPP_PHONE_NUMBER_ID
    ) {
      logger.info({ to: params.to, body: params.body }, 'whatsapp (mock)');
      return { messageId: `mock-whatsapp-${randomUUID()}` };
    }

    const res = await fetch(
      `https://graph.facebook.com/v18.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: params.to.replace(/^\+/, ''),
          type: 'text',
          text: { body: params.body },
        }),
      },
    );

    const json = (await res.json()) as MetaError & MetaSuccess;
    if (!res.ok || json.error || !json.messages?.[0]?.id) {
      const detail = json.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`Meta WhatsApp send failed: ${detail}`);
    }

    return { messageId: json.messages[0].id };
  }
}
