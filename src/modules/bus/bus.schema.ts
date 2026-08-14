import { z } from 'zod';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const phoneSchema = z.string().regex(/^\+?\d{9,15}$/, 'Invalid phone number');

// ---- Operator profiles ----

export const updateOperatorProfileSchema = z.object({
  body: z
    .object({
      businessName: z.string().min(1).optional(),
      description: z.string().max(500).optional(),
      phone: phoneSchema.optional(),
      logoUrl: z.string().url().optional(),
      licenseNumber: z.string().min(1).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'At least one field must be provided',
    }),
});

export const operatorParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid operator id') }),
});

export const listOperatorsSchema = z.object({
  querystring: paginationSchema,
});

// ---- Buses ----

export const createBusSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    plateNumber: z.string().min(1, 'Plate number is required'),
    capacity: z.number().int().min(1).max(200, 'Capacity cannot exceed 200'),
    busType: z.enum(['STANDARD', 'VIP', 'EXECUTIVE']).optional(),
  }),
});

export const updateBusSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid bus id') }),
  body: z
    .object({
      name: z.string().min(1).optional(),
      plateNumber: z.string().min(1).optional(),
      capacity: z.number().int().min(1).max(200).optional(),
      busType: z.enum(['STANDARD', 'VIP', 'EXECUTIVE']).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'At least one field must be provided',
    }),
});

export const busParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid bus id') }),
});

export const listOperatorBusesSchema = z.object({
  params: z.object({ operatorId: z.string().uuid('Invalid operator id') }),
});

// ---- Routes ----

export const createRouteSchema = z.object({
  body: z.object({
    fromCity: z.string().min(1, 'fromCity is required'),
    toCity: z.string().min(1, 'toCity is required'),
    basePrice: z.number().positive('basePrice must be positive'),
    distanceKm: z.number().int().min(1).optional(),
  }),
});

export const updateRouteSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid route id') }),
  body: z
    .object({
      fromCity: z.string().min(1).optional(),
      toCity: z.string().min(1).optional(),
      basePrice: z.number().positive().optional(),
      distanceKm: z.number().int().min(1).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'At least one field must be provided',
    }),
});

export const routeParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid route id') }),
});

// ---- Trips ----

export const searchTripsSchema = z.object({
  querystring: paginationSchema.extend({
    fromCity: z.string().min(1).optional(),
    toCity: z.string().min(1).optional(),
    date: z.string().optional(),
  }),
});

export const createTripSchema = z.object({
  body: z.object({
    routeId: z.string().uuid('Invalid route id'),
    busId: z.string().uuid('Invalid bus id'),
    departureTime: z.string().datetime({ offset: true }),
    arrivalTime: z.string().datetime({ offset: true }),
    price: z.number().positive('price must be positive'),
  }),
});

export const updateTripSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid trip id') }),
  body: z
    .object({
      departureTime: z.string().datetime({ offset: true }).optional(),
      arrivalTime: z.string().datetime({ offset: true }).optional(),
      price: z.number().positive().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'At least one field must be provided',
    }),
});

export const updateTripStatusSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid trip id') }),
  body: z.object({
    status: z.enum(['SCHEDULED', 'BOARDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED']),
  }),
});

export const tripParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid trip id') }),
});

// ---- Bookings ----

export const createBookingSchema = z.object({
  body: z.object({
    tripId: z.string().uuid('Invalid trip id'),
    seatNumber: z.string().min(1, 'seatNumber is required'),
    passengerName: z.string().min(1, 'passengerName is required'),
    passengerPhone: phoneSchema,
  }),
});

export const bookingParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid booking id') }),
});

export type UpdateOperatorProfileInput = z.infer<typeof updateOperatorProfileSchema>['body'];
export type CreateBusInput = z.infer<typeof createBusSchema>['body'];
export type UpdateBusInput = z.infer<typeof updateBusSchema>['body'];
export type CreateRouteInput = z.infer<typeof createRouteSchema>['body'];
export type UpdateRouteInput = z.infer<typeof updateRouteSchema>['body'];
export type CreateTripInput = z.infer<typeof createTripSchema>['body'];
export type UpdateTripInput = z.infer<typeof updateTripSchema>['body'];
export type CreateBookingInput = z.infer<typeof createBookingSchema>['body'];
