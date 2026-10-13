import { z } from 'zod';

const uuid = z.string().uuid('Invalid id');

export const quotePromotionSchema = z.object({
  body: z.object({
    dishId: uuid,
    days: z.number().int().min(1).max(90),
  }),
});

export const createPromotionSchema = z.object({
  body: z.object({
    dishId: uuid,
    headline: z.string().min(1, 'Headline is required').max(80),
    description: z.string().max(200).optional(),
    imageUrl: z.string().url('Image must be a valid URL').optional().or(z.literal('')),
    days: z.number().int().min(1).max(90),
    startsAt: z.string().datetime({ offset: true }).optional(),
  }),
});

export const promotionParamsSchema = z.object({
  params: z.object({ id: uuid }),
});

export const listMyPromotionsSchema = z.object({
  querystring: z
    .object({
      status: z.enum(['PENDING_PAYMENT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
    })
    .default({}),
});

export const listActivePromotionsSchema = z.object({
  querystring: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      vendorId: uuid.optional(),
    })
    .default({ page: 1, limit: 20 }),
});

export type QuotePromotionInput = z.infer<typeof quotePromotionSchema>['body'];
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>['body'];
