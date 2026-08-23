import { z } from 'zod';

export const couponTypeSchema = z.enum(['PERCENT', 'FIXED']);
export const couponApplicableToSchema = z.enum(['TRIP', 'FOOD', 'BOTH']);

export const createCouponSchema = z.object({
  body: z
    .object({
      code: z
        .string()
        .min(1)
        .max(50)
        .transform((s) => s.trim().toUpperCase()),
      type: couponTypeSchema,
      value: z.number().positive('value must be positive'),
      maxUses: z.number().int().min(0).default(0),
      perUserUses: z.number().int().min(1).default(1),
      validFrom: z.string().datetime({ offset: true }),
      validTo: z.string().datetime({ offset: true }),
      applicableTo: couponApplicableToSchema.default('BOTH'),
      minSpend: z.number().positive().optional(),
      isActive: z.boolean().default(true),
    })
    .refine((c) => c.type !== 'PERCENT' || c.value <= 100, {
      message: 'PERCENT coupon value cannot exceed 100',
      path: ['value'],
    })
    .refine((c) => new Date(c.validTo) > new Date(c.validFrom), {
      message: 'validTo must be after validFrom',
      path: ['validTo'],
    }),
});

export const updateCouponSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid coupon id') }),
  body: z
    .object({
      type: couponTypeSchema.optional(),
      value: z.number().positive().optional(),
      maxUses: z.number().int().min(0).optional(),
      perUserUses: z.number().int().min(1).optional(),
      validFrom: z.string().datetime({ offset: true }).optional(),
      validTo: z.string().datetime({ offset: true }).optional(),
      applicableTo: couponApplicableToSchema.optional(),
      minSpend: z.number().positive().nullable().optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'At least one field must be provided',
    }),
});

export const couponParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid coupon id') }),
});

export const listCouponsSchema = z.object({
  querystring: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    isActive: z.enum(['true', 'false']).optional(),
  }),
});

export const validateCouponSchema = z.object({
  params: z.object({
    code: z
      .string()
      .min(1)
      .max(50)
      .transform((s) => s.trim().toUpperCase()),
  }),
  querystring: z.object({
    applicableTo: couponApplicableToSchema.optional(),
    amount: z.coerce.number().positive().optional(),
  }),
});

export type CreateCouponInput = z.infer<typeof createCouponSchema>['body'];
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>['body'];
