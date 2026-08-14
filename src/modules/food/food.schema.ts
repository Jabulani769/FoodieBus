import { z } from 'zod';

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase, alphanumeric, hyphen-separated');

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    slug: slugSchema,
    sortOrder: z.number().int().min(0).default(0),
  }),
});

export const updateCategorySchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid category id') }),
  body: z
    .object({
      name: z.string().min(1).optional(),
      slug: slugSchema.optional(),
      sortOrder: z.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'At least one field must be provided',
    }),
});

export const listCategoriesSchema = z.object({});

export const categoryParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid category id') }),
});

export const listVendorsSchema = z.object({
  querystring: paginationSchema,
});

export const getVendorParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid vendor id') }),
});

export const updateVendorProfileSchema = z.object({
  body: z
    .object({
      businessName: z.string().min(1).optional(),
      description: z.string().max(500).optional(),
      phone: z
        .string()
        .regex(/^\+?\d{9,15}$/, 'Invalid phone number')
        .optional(),
      logoUrl: z.string().url().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'At least one field must be provided',
    }),
});

export const listDishesSchema = z.object({
  params: z.object({ vendorId: z.string().uuid('Invalid vendor id') }),
  querystring: paginationSchema.extend({
    categoryId: z.string().uuid().optional(),
    isAvailable: z.enum(['true', 'false']).optional(),
  }),
});

export const getDishParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid dish id') }),
});

export const createDishSchema = z.object({
  body: z.object({
    categoryId: z.string().uuid('Invalid category id'),
    name: z.string().min(1, 'Name is required'),
    description: z.string().max(1000).optional(),
    price: z.number().positive('Price must be positive'),
    imageUrl: z.string().url().optional(),
    sortOrder: z.number().int().min(0).default(0),
  }),
});

export const updateDishSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid dish id') }),
  body: z
    .object({
      categoryId: z.string().uuid().optional(),
      name: z.string().min(1).optional(),
      description: z.string().max(1000).optional(),
      price: z.number().positive().optional(),
      imageUrl: z.string().url().optional(),
      sortOrder: z.number().int().min(0).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'At least one field must be provided',
    }),
});

export const updateAvailabilitySchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid dish id') }),
  body: z.object({
    isAvailable: z.boolean(),
    availableFrom: z.string().datetime({ offset: true }).optional(),
    availableTo: z.string().datetime({ offset: true }).optional(),
  }),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>['body'];
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>['body'];
export type CreateDishInput = z.infer<typeof createDishSchema>['body'];
export type UpdateDishInput = z.infer<typeof updateDishSchema>['body'];
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>['body'];
export type UpdateVendorProfileInput = z.infer<typeof updateVendorProfileSchema>['body'];
