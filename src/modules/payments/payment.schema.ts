import { z } from 'zod';

export const createPaymentSchema = z.object({
  body: z.object({
    bookingId: z.string().uuid('Invalid booking id'),
  }),
});

export const paymentParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid payment id') }),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>['body'];
