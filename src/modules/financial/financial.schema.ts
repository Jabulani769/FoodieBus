import { z } from 'zod';

const refundStatusSchema = z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSED', 'FAILED']);

const settlementStatusSchema = z.enum(['PENDING', 'PAID']);

export const requestRefundSchema = z.object({
  body: z.object({
    paymentId: z.string().uuid('Invalid payment id'),
    amount: z.coerce.number().positive('Amount must be positive'),
    reason: z.string().min(1).max(500),
  }),
});

export const listRefundsSchema = z.object({
  querystring: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: refundStatusSchema.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});

export const refundIdParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid refund id'),
  }),
});

export const rejectRefundSchema = z.object({
  body: z.object({
    reason: z.string().min(1).max(500),
  }),
});

export const dateRangeQuerySchema = z.object({
  querystring: z.object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  }),
});

export const listSettlementsSchema = z.object({
  querystring: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    operatorId: z.string().uuid('Invalid operator id').optional(),
    vendorId: z.string().uuid('Invalid vendor id').optional(),
    period: z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format')
      .optional(),
    status: settlementStatusSchema.optional(),
  }),
});

export const generateSettlementsSchema = z.object({
  body: z.object({
    period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format'),
  }),
});

export const settlementIdParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid settlement id'),
  }),
});
