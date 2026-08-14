import { AppError } from '../../../shared/errors/AppError.js';
import type { NotificationProvider } from './types.js';
import { SmsProvider } from './sms.provider.js';
import { WhatsAppProvider } from './whatsapp.provider.js';
import { EmailProvider } from './email.provider.js';

const sms = new SmsProvider();
const whatsapp = new WhatsAppProvider();
const email = new EmailProvider();

const providers: Record<'SMS' | 'WHATSAPP' | 'EMAIL', NotificationProvider> = {
  SMS: sms,
  WHATSAPP: whatsapp,
  EMAIL: email,
};

export function getProvider(channel: 'SMS' | 'WHATSAPP' | 'EMAIL'): NotificationProvider {
  const provider = providers[channel];
  if (!provider) {
    throw AppError.validation(`Unsupported notification channel: ${channel}`);
  }
  return provider;
}

export { SmsProvider, WhatsAppProvider, EmailProvider };
export type { NotificationProvider } from './types.js';
