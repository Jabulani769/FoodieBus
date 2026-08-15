import { z } from 'zod';

const foodOrderStatusSchema = z.enum([
  'PLACED',
  'PREPARING',
  'READY',
  'DELIVERED_TO_BUS',
  'CANCELLED',
]);

export const placeFoodOrderSchema = z.object({
  body: z.object({
    bookingId: z.string().uuid('Invalid booking id'),
    items: z
      .array(
        z.object({
          dishId: z.string().uuid('Invalid dish id'),
          quantity: z.number().int().min(1).max(50),
        }),
      )
      .min(1, 'At least one item is required'),
    note: z.string().max(300).optional(),
  }),
});

export const foodOrderParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid food order id') }),
});

export const updateFoodOrderStatusSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid food order id') }),
  body: z.object({
    status: foodOrderStatusSchema,
  }),
});

export const listVendorOrdersSchema = z.object({
  querystring: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: foodOrderStatusSchema.optional(),
  }),
});

export const vendorParamsSchema = z.object({
  params: z.object({ vendorId: z.string().uuid('Invalid vendor id') }),
});
