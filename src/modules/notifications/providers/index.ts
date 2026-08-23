import { AppError } from '../../../shared/errors/AppError.js';
import type { NotificationProvider } from './types.js';
import { SmsProvider } from './sms.provider.js';
import { WhatsAppProvider } from './whatsapp.provider.js';
import { EmailProvider } from './email.provider.js';
import { PushProvider } from './push.provider.js';

const sms = new SmsProvider();
const whatsapp = new WhatsAppProvider();
const email = new EmailProvider();
const push = new PushProvider();

const providers: Record<'SMS' | 'WHATSAPP' | 'EMAIL' | 'PUSH', NotificationProvider> = {
  SMS: sms,
  WHATSAPP: whatsapp,
  EMAIL: email,
  PUSH: push,
};

export function getProvider(channel: 'SMS' | 'WHATSAPP' | 'EMAIL' | 'PUSH'): NotificationProvider {
  const provider = providers[channel];
  if (!provider) {
    throw AppError.validation(`Unsupported notification channel: ${channel}`);
  }
  return provider;
}

export { SmsProvider, WhatsAppProvider, EmailProvider, PushProvider };
export type { NotificationProvider } from './types.js';
