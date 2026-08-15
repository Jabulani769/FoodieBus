import { z } from 'zod';

export const ratingEntityTypes = ['TRIP', 'DISH', 'OPERATOR', 'VENDOR'] as const;

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createRatingSchema = z.object({
  body: z.object({
    entityType: z.enum(ratingEntityTypes),
    entityId: z.string().min(1, 'Entity id is required'),
    score: z
      .number()
      .int()
      .min(1, 'Score must be between 1 and 5')
      .max(5, 'Score must be between 1 and 5'),
    comment: z.string().max(1000).optional(),
  }),
});

export const updateRatingSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid rating id') }),
  body: z
    .object({
      score: z.number().int().min(1).max(5).optional(),
      comment: z.string().max(1000).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'At least one field must be provided',
    }),
});

export const ratingParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid rating id') }),
});

export const listRatingsSchema = z.object({
  querystring: paginationSchema.extend({
    entityType: z.enum(ratingEntityTypes).optional(),
    entityId: z.string().min(1).optional(),
  }),
});

export type CreateRatingInput = z.infer<typeof createRatingSchema>['body'];
export type UpdateRatingInput = z.infer<typeof updateRatingSchema>['body'];
export type ListRatingsQuery = z.infer<typeof listRatingsSchema>['querystring'];
