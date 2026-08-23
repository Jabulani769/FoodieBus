import { randomUUID } from 'node:crypto';
import { env } from '../../../shared/config/env.js';
import { logger } from '../../../shared/logger/index.js';
import type { NotificationProvider } from './types.js';

interface PushParams {
  to: string;
  subject?: string;
  body: string;
}

/**
 * Push notification provider. Supports FCM (HTTP v1 legacy via server key) and APNs
 * (HTTP/2 to api.push.apple.com). Falls back to a mock (log-only) send when the provider
 * is not configured, so tests and local development never hit external services.
 */
export class PushProvider implements NotificationProvider {
  readonly name = 'push';

  async send(params: PushParams): Promise<{ messageId: string }> {
    if (env.PUSH_PROVIDER === 'fcm' && env.FCM_SERVER_KEY) {
      return this.sendFcm(params);
    }
    if (env.PUSH_PROVIDER === 'apns' && env.APNS_KEY_ID && env.APNS_TEAM_ID) {
      return this.sendApns(params);
    }
    logger.info({ to: params.to, body: params.body }, 'push (mock)');
    return { messageId: `mock-push-${randomUUID()}` };
  }

  private async sendFcm(params: PushParams): Promise<{ messageId: string }> {
    const res = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        Authorization: `key=${env.FCM_SERVER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: params.to,
        notification: {
          title: params.subject ?? 'FoodieBus',
          body: params.body,
        },
      }),
    });

    const json = (await res.json()) as { message_id?: string; error?: string };
    if (!res.ok || !json.message_id) {
      throw new Error(`FCM send failed: ${json.error ?? `HTTP ${res.status}`}`);
    }
    return { messageId: json.message_id };
  }

  private async sendApns(params: PushParams): Promise<{ messageId: string }> {
    if (!params.to) throw new Error('APNs requires a device token');
    const res = await fetch(`https://api.push.apple.com/3/device/${params.to}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `bearer ${env.APNS_TEAM_ID}`,
        'apns-topic': env.APNS_TOPIC,
        'apns-push-type': 'alert',
      },
      body: JSON.stringify({
        aps: {
          alert: { title: params.subject ?? 'FoodieBus', body: params.body },
          sound: 'default',
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`APNs send failed: HTTP ${res.status}`);
    }
    return { messageId: randomUUID() };
  }
}

export const pushProvider = new PushProvider();
