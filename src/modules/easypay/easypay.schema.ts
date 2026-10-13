import { z } from 'zod';

const phone = z.string().regex(/^\+?\d{9,15}$/, 'Invalid phone number');

export const requestOtpSchema = z.object({
  body: z.object({
    phone,
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    phone,
    code: z.string().min(4, 'Code is required').max(8, 'Code is too long'),
  }),
});

export const bookBusSchema = z.object({
  body: z.object({
    route_id: z.string().min(1, 'route_id is required'),
    passenger_name: z.string().optional(),
    passenger_phone: phone.optional(),
    seat_number: z.string().optional(),
    payment_method: z.string().optional(),
  }),
});

export const foodOrderSchema = z.object({
  body: z.object({
    kitchen_id: z.string().min(1, 'kitchen_id is required'),
    items: z
      .array(
        z.object({
          item_id: z.string().min(1),
          quantity: z.number().int().min(1),
          selected_options: z
            .array(
              z.object({
                group_id: z.string().min(1),
                option_ids: z.array(z.string().min(1)).min(1).max(20),
              }),
            )
            .max(20)
            .optional(),
        }),
      )
      .min(1, 'At least one item is required'),
    payment_method: z.string().optional(),
    delivery_address: z.string().optional(),
    total_price: z.number().nonnegative().optional(),
    booking_id: z.string().optional(),
    delivery_lat: z.number().min(-90).max(90).optional(),
    delivery_lng: z.number().min(-180).max(180).optional(),
  }),
});

export const listKitchensSchema = z.object({
  querystring: z
    .object({
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
      category: z.string().min(1).max(120).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .default({ page: 1, limit: 50 })
    .refine(
      (q) =>
        (q.lat === undefined && q.lng === undefined) ||
        (q.lat !== undefined && q.lng !== undefined),
      { message: 'lat and lng must be provided together' },
    ),
});

export const kitchenParamsSchema = z.object({
  params: z.object({ id: z.string().min(1, 'kitchen id is required') }),
});

export const foodPreviewSchema = z.object({
  body: z.object({
    kitchen_id: z.string().min(1, 'kitchen_id is required'),
    items: z
      .array(
        z.object({
          item_id: z.string().min(1),
          quantity: z.number().int().min(1).max(50),
          selected_options: z
            .array(
              z.object({
                group_id: z.string().min(1),
                option_ids: z.array(z.string().min(1)).min(1).max(20),
              }),
            )
            .max(20)
            .optional(),
        }),
      )
      .min(1, 'At least one item is required'),
  }),
});

export const profileUpdateSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
  }),
});
