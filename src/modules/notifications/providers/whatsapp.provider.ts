import { randomUUID } from 'node:crypto';
import { env } from '../../../shared/config/env.js';
import { logger } from '../../../shared/logger/index.js';
import type { NotificationProvider } from './types.js';

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
    // TODO: wire Meta WhatsApp Cloud API here.
    throw new Error('Meta WhatsApp provider not implemented yet');
  }
}
