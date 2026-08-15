import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().url().min(1),

  REDIS_URL: z.string().url().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  PAYCHANGU_SECRET_KEY: z.string().optional(),
  PAYCHANGU_PUBLIC_KEY: z.string().optional(),
  PAYCHANGU_WEBHOOK_SECRET: z.string().optional(),
  PAYCHANGU_BASE_URL: z.string().url().default('https://api.paychangu.com'),
  PAYCHANGU_CALLBACK_URL: z.string().url().optional(),
  PAYCHANGU_RETURN_URL: z.string().url().optional(),

  SENTRY_DSN: z.string().url().optional().or(z.literal('')),

  BOOKING_HOLD_MINUTES: z.coerce.number().int().min(1).default(15),
  OTP_TTL_MINUTES: z.coerce.number().int().min(1).default(10),

  COMMISSION_RATE: z.coerce.number().min(0).max(1).default(0.1),

  SMS_PROVIDER: z.enum(['mock', 'africastalking']).default('mock'),
  SMS_API_KEY: z.string().optional(),
  SMS_API_USERNAME: z.string().optional(),
  SMS_SENDER_ID: z.string().default('FoodieBus'),

  WHATSAPP_PROVIDER: z.enum(['mock', 'meta']).default('mock'),
  WHATSAPP_API_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),

  EMAIL_PROVIDER: z.enum(['mock', 'resend', 'smtp']).default('mock'),
  EMAIL_FROM: z.string().default('noreply@foodiebus.mw'),
  EMAIL_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`[config] Invalid environment variables — failing fast:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
