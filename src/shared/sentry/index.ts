import * as Sentry from '@sentry/node';
import { env } from '../config/env.js';

export function initSentry(): void {
  if (!env.SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0,
  });
}

export function captureException(error: unknown): void {
  if (!env.SENTRY_DSN) {
    return;
  }
  Sentry.captureException(error);
}
