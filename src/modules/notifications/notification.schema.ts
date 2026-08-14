import { z } from 'zod';

export const listNotificationsSchema = z.object({
  querystring: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const notificationParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid notification id'),
  }),
});

export const updatePreferenceSchema = z.object({
  body: z
    .object({
      sms: z.boolean().optional(),
      whatsapp: z.boolean().optional(),
      email: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'At least one preference field must be provided',
    }),
});
