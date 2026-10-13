import { z } from 'zod';

const foodOrderStatusSchema = z.enum([
  'PLACED',
  'PREPARING',
  'READY',
  'DELIVERED_TO_BUS',
  'CANCELLED',
]);

const selectedOptionSchema = z.object({
  groupId: z.string().uuid('Invalid group id'),
  optionIds: z.array(z.string().uuid('Invalid option id')).min(1).max(20),
});

export const placeFoodOrderSchema = z.object({
  body: z.object({
    bookingId: z.string().uuid('Invalid booking id'),
    items: z
      .array(
        z.object({
          dishId: z.string().uuid('Invalid dish id'),
          quantity: z.number().int().min(1).max(50),
          selectedOptions: z.array(selectedOptionSchema).max(20).optional(),
        }),
      )
      .min(1, 'At least one item is required'),
    note: z.string().max(300).optional(),
    couponCode: z
      .string()
      .min(1)
      .max(50)
      .transform((s) => s.trim().toUpperCase())
      .optional(),
    deliveryLat: z.number().min(-90).max(90).optional(),
    deliveryLng: z.number().min(-180).max(180).optional(),
  }),
});

export const foodOrderParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid food order id') }),
});

export const updateFoodOrderStatusSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid food order id') }),
  body: z.object({
    status: foodOrderStatusSchema,
    prepMinutes: z.number().int().min(5).max(180).optional(),
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
