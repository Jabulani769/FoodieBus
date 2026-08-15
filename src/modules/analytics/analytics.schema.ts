import { z } from 'zod';

export const dateRangeQuerySchema = z.object({
  querystring: z.object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  }),
});

export const growthQuerySchema = z.object({
  querystring: z.object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    granularity: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  }),
});

export const tripUtilizationQuerySchema = z.object({
  querystring: z.object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    routeId: z.string().uuid('Invalid route id').optional(),
    operatorId: z.string().uuid('Invalid operator id').optional(),
  }),
});

export const topPassengersQuerySchema = z.object({
  querystring: z.object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    sortBy: z.enum(['bookings', 'spend']).default('bookings'),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }),
});
