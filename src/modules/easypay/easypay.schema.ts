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
      .array(z.object({ item_id: z.string().min(1), quantity: z.number().int().min(1) }))
      .min(1, 'At least one item is required'),
    payment_method: z.string().optional(),
    delivery_address: z.string().optional(),
    total_price: z.number().nonnegative().optional(),
    booking_id: z.string().optional(),
  }),
});

export const profileUpdateSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
  }),
});
