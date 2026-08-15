import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../../shared/config/env.js';
import { SmsProvider } from './sms.provider.js';
import { WhatsAppProvider } from './whatsapp.provider.js';
import { EmailProvider } from './email.provider.js';

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn() },
}));

import nodemailer from 'nodemailer';

const fetchMock = vi.fn();

const sendMailMock = vi.fn();
const closeMock = vi.fn();
const createTransportMock = vi.mocked(nodemailer.createTransport);

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('notification providers', () => {
  const originalEnv = { ...env };

  beforeEach(() => {
    Object.assign(env, originalEnv);
    fetchMock.mockReset();
    sendMailMock.mockReset();
    closeMock.mockReset();
    createTransportMock.mockReset();
    createTransportMock.mockReturnValue({
      sendMail: sendMailMock,
      close: closeMock,
    } as never);
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.assign(env, originalEnv);
  });

  describe('SmsProvider', () => {
    it('returns a mock id when SMS_PROVIDER is mock', async () => {
      env.SMS_PROVIDER = 'mock';
      const { messageId } = await new SmsProvider().send({ to: '+265991000000', body: 'hi' });
      expect(messageId).toMatch(/^mock-sms-/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("posts to Africa's Talking and maps a successful response", async () => {
      env.SMS_PROVIDER = 'africastalking';
      env.SMS_API_KEY = 'at-key';
      env.SMS_API_USERNAME = 'foodiebus';
      fetchMock.mockResolvedValue(
        jsonResponse({
          SMSMessageData: {
            Message: 'Sent to 1/1',
            Recipients: [{ status: 'Success', number: '+265991000000', messageId: 'ATPid_123' }],
          },
        }),
      );

      const { messageId } = await new SmsProvider().send({
        to: '+265991000000',
        body: 'hello',
      });
      expect(messageId).toBe('ATPid_123');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.africastalking.com/version1/messaging');
      expect(init?.headers).toMatchObject({ apiKey: 'at-key' });
      const body = init?.body as string;
      expect(body).toContain('username=foodiebus');
      expect(body).toContain('from=FoodieBus');
    });

    it('throws when a recipient reports a failure status', async () => {
      env.SMS_PROVIDER = 'africastalking';
      env.SMS_API_KEY = 'at-key';
      fetchMock.mockResolvedValue(
        jsonResponse({
          SMSMessageData: { Recipients: [{ status: 'Failed', messageId: undefined }] },
        }),
      );

      await expect(new SmsProvider().send({ to: '+265991000000', body: 'hi' })).rejects.toThrow(
        "Africa's Talking SMS send failed",
      );
    });

    it('throws on a non-OK HTTP response', async () => {
      env.SMS_PROVIDER = 'africastalking';
      env.SMS_API_KEY = 'at-key';
      fetchMock.mockResolvedValue(jsonResponse({}, false, 401));

      await expect(new SmsProvider().send({ to: '+265991000000', body: 'hi' })).rejects.toThrow(
        /HTTP 401/,
      );
    });
  });

  describe('WhatsAppProvider', () => {
    it('returns a mock id when WHATSAPP_PROVIDER is mock', async () => {
      env.WHATSAPP_PROVIDER = 'mock';
      const { messageId } = await new WhatsAppProvider().send({
        to: '+265991000000',
        body: 'hi',
      });
      expect(messageId).toMatch(/^mock-whatsapp-/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('posts to the Meta Cloud API and strips the leading + from the number', async () => {
      env.WHATSAPP_PROVIDER = 'meta';
      env.WHATSAPP_API_TOKEN = 'wa-token';
      env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
      fetchMock.mockResolvedValue(
        jsonResponse({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.abc' }] }),
      );

      const { messageId } = await new WhatsAppProvider().send({
        to: '+265991000000',
        body: 'hello',
      });
      expect(messageId).toBe('wamid.abc');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://graph.facebook.com/v18.0/123456789/messages');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer wa-token' });
      const body = JSON.parse(init?.body as string);
      expect(body.to).toBe('265991000000');
      expect(body.type).toBe('text');
    });

    it('throws when Meta returns an error body', async () => {
      env.WHATSAPP_PROVIDER = 'meta';
      env.WHATSAPP_API_TOKEN = 'wa-token';
      env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
      fetchMock.mockResolvedValue(
        jsonResponse({
          error: { message: '(#131030) Recipient phone number not in allowed list' },
        }),
      );

      await expect(
        new WhatsAppProvider().send({ to: '+265991000000', body: 'hi' }),
      ).rejects.toThrow(/not in allowed list/);
    });
  });

  describe('EmailProvider', () => {
    it('returns a mock id when EMAIL_PROVIDER is mock', async () => {
      env.EMAIL_PROVIDER = 'mock';
      const { messageId } = await new EmailProvider().send({
        to: 'a@b.mw',
        subject: 'Hi',
        body: 'hello',
      });
      expect(messageId).toMatch(/^mock-email-/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('posts to Resend and returns the email id', async () => {
      env.EMAIL_PROVIDER = 'resend';
      env.EMAIL_API_KEY = 're_test';
      env.EMAIL_FROM = 'noreply@foodiebus.mw';
      fetchMock.mockResolvedValue(jsonResponse({ id: '49a3999c-0ce1-4ea6-ab68' }));

      const { messageId } = await new EmailProvider().send({
        to: 'a@b.mw',
        subject: 'Hello',
        body: 'world',
      });
      expect(messageId).toBe('49a3999c-0ce1-4ea6-ab68');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.resend.com/emails');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer re_test' });
      const body = JSON.parse(init?.body as string);
      expect(body.from).toBe('noreply@foodiebus.mw');
      expect(body.to).toEqual(['a@b.mw']);
    });

    it('throws when Resend returns an error', async () => {
      env.EMAIL_PROVIDER = 'resend';
      env.EMAIL_API_KEY = 're_test';
      fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Invalid API key' } }));

      await expect(
        new EmailProvider().send({ to: 'a@b.mw', subject: 'Hi', body: 'x' }),
      ).rejects.toThrow(/Invalid API key/);
    });

    it('returns a mock id when smtp is selected but host is missing', async () => {
      env.EMAIL_PROVIDER = 'smtp';
      env.SMTP_HOST = '';
      const { messageId } = await new EmailProvider().send({
        to: 'a@b.mw',
        subject: 'Hi',
        body: 'x',
      });
      expect(messageId).toMatch(/^mock-email-/);
    });

    it('sends via nodemailer when smtp is selected', async () => {
      env.EMAIL_PROVIDER = 'smtp';
      env.SMTP_HOST = 'smtp.mail.mw';
      env.SMTP_PORT = 587;
      env.SMTP_USER = 'user';
      env.SMTP_PASS = 'pass';
      sendMailMock.mockResolvedValue({ messageId: '<smtp-msg-1@mail.mw>' });

      const { messageId } = await new EmailProvider().send({
        to: 'a@b.mw',
        subject: 'Hello',
        body: 'world',
      });
      expect(messageId).toBe('<smtp-msg-1@mail.mw>');

      expect(createTransportMock).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.mail.mw',
          port: 587,
          secure: false,
          auth: { user: 'user', pass: 'pass' },
        }),
      );
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@b.mw', subject: 'Hello', text: 'world' }),
      );
      expect(closeMock).toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uses secure mode and no auth when no user is configured', async () => {
      env.EMAIL_PROVIDER = 'smtp';
      env.SMTP_HOST = 'smtp.mail.mw';
      env.SMTP_PORT = 465;
      env.SMTP_USER = '';
      sendMailMock.mockResolvedValue({ messageId: '<smtp-msg-2@mail.mw>' });

      const { messageId } = await new EmailProvider().send({
        to: 'a@b.mw',
        subject: 'Hi',
        body: 'x',
      });
      expect(messageId).toBe('<smtp-msg-2@mail.mw>');
      expect(createTransportMock).toHaveBeenCalledWith(
        expect.objectContaining({ port: 465, secure: true, auth: undefined }),
      );
    });

    it('re-throws a nodemailer failure', async () => {
      env.EMAIL_PROVIDER = 'smtp';
      env.SMTP_HOST = 'smtp.mail.mw';
      sendMailMock.mockRejectedValue(new Error('connection refused'));

      await expect(
        new EmailProvider().send({ to: 'a@b.mw', subject: 'Hi', body: 'x' }),
      ).rejects.toThrow(/connection refused/);
      expect(closeMock).toHaveBeenCalled();
    });
  });
});
