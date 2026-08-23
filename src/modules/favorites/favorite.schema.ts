import { z } from 'zod';

export const addFavoriteSchema = z.object({
  body: z
    .object({
      dishId: z.string().uuid('Invalid dish id').optional(),
      vendorId: z.string().uuid('Invalid vendor id').optional(),
    })
    .refine((b) => b.dishId || b.vendorId, {
      message: 'Either dishId or vendorId is required',
    })
    .refine((b) => !(b.dishId && b.vendorId), {
      message: 'Provide exactly one of dishId or vendorId',
    }),
});

export const listFavoritesSchema = z.object({
  querystring: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export type AddFavoriteInput = z.infer<typeof addFavoriteSchema>['body'];
