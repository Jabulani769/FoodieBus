import { z } from 'zod';

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase, alphanumeric, hyphen-separated');

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || `category-${Date.now()}`
  );
}

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    slug: slugSchema.optional(),
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

export const listCategoriesSchema = z.object({
  querystring: z
    .object({
      search: z.string().min(1).max(100).optional(),
      includeInactive: z.enum(['true', 'false']).optional(),
    })
    .default({}),
});

export const findOrCreateCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').max(120),
  }),
});

export const reorderCategoriesSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          id: z.string().uuid('Invalid category id'),
          sortOrder: z.number().int().min(0),
        }),
      )
      .min(1)
      .max(200),
  }),
});

export const categoryParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid category id') }),
});

export const listVendorsSchema = z.object({
  querystring: paginationSchema.extend({
    categoryId: z.string().uuid().optional(),
    categorySlug: z.string().min(1).max(120).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().max(100).optional(),
    onlyOpen: z.enum(['true', 'false']).optional(),
  }),
});

export const getVendorParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid vendor id') }),
});

// ---- Settings-save hardening ----
// Antd forms submit `""` for cleared inputs and hidden lat/lng inputs arrive as
// strings. Without this, every optional `.url()` / phone / number field 400s and
// the Save button looks stuck spinning. Empty → undefined, numeric strings → numbers.
const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const optionalUrl = () =>
  z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().url('Must be a valid URL (https://…)').optional(),
  );

const optionalPhone = () =>
  z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z
      .string()
      .regex(/^\+?\d{9,15}$/, 'Invalid phone number (e.g. +265991234567)')
      .optional(),
  );

export const updateVendorProfileSchema = z.object({
  body: z
    .object({
      businessName: emptyToUndefined(z.string().min(1, 'Business name required')),
      description: emptyToUndefined(z.string().max(500)),
      phone: optionalPhone(),
      logoUrl: optionalUrl(),
      bannerUrl: optionalUrl(),
      cuisineType: emptyToUndefined(z.string().max(120)),
      deliveryTime: z.coerce.number().int().min(1).max(240).optional(),
      deliveryRadiusKm: z.coerce.number().positive().max(100).optional(),
      address: emptyToUndefined(z.string().min(1).max(255)),
      city: emptyToUndefined(z.string().min(1).max(120)),
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'At least one field must be provided',
    })
    .refine(
      (b) =>
        (b.latitude === undefined && b.longitude === undefined) ||
        (b.latitude !== undefined && b.longitude !== undefined),
      { message: 'latitude and longitude must be provided together' },
    ),
});

export const pauseVendorSchema = z.object({
  body: z.object({
    isPaused: z.boolean(),
  }),
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be HH:mm 24h');

export const upsertHoursSchema = z.object({
  body: z.object({
    hours: z
      .array(
        z.object({
          dayOfWeek: z.number().int().min(0).max(6),
          openTime: timeSchema,
          closeTime: timeSchema,
          isClosed: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(7),
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
    description: emptyToUndefined(z.string().max(1000)),
    price: z.coerce.number().positive('Price must be positive'),
    imageUrl: optionalUrl(),
    sortOrder: z.coerce.number().int().min(0).default(0),
  }),
});

export const updateDishSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid dish id') }),
  body: z
    .object({
      categoryId: z.string().uuid().optional(),
      name: z.string().min(1).optional(),
      description: emptyToUndefined(z.string().max(1000)),
      price: z.coerce.number().positive().optional(),
      imageUrl: optionalUrl(),
      sortOrder: z.coerce.number().int().min(0).optional(),
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

const optionGroupTypeSchema = z.enum(['SINGLE', 'MULTI']);

export const createOptionGroupSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid dish id') }),
  body: z.object({
    name: z.string().min(1).max(120),
    type: optionGroupTypeSchema.default('SINGLE'),
    isRequired: z.boolean().default(false),
    minSelect: z.number().int().min(0).default(0),
    maxSelect: z.number().int().min(1).optional(),
    sortOrder: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
  }),
});

export const updateOptionGroupSchema = z.object({
  params: z.object({
    dishId: z.string().uuid('Invalid dish id'),
    groupId: z.string().uuid('Invalid group id'),
  }),
  body: z
    .object({
      name: z.string().min(1).max(120).optional(),
      type: optionGroupTypeSchema.optional(),
      isRequired: z.boolean().optional(),
      minSelect: z.number().int().min(0).optional(),
      maxSelect: z.number().int().min(1).nullable().optional(),
      sortOrder: z.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'At least one field must be provided',
    }),
});

export const optionGroupParamsSchema = z.object({
  params: z.object({
    dishId: z.string().uuid('Invalid dish id'),
    groupId: z.string().uuid('Invalid group id'),
  }),
});

export const createOptionSchema = z.object({
  params: z.object({
    dishId: z.string().uuid('Invalid dish id'),
    groupId: z.string().uuid('Invalid group id'),
  }),
  body: z.object({
    label: z.string().min(1).max(120),
    priceDelta: z.number().min(0).default(0),
    sortOrder: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
  }),
});

export const updateOptionSchema = z.object({
  params: z.object({
    dishId: z.string().uuid('Invalid dish id'),
    groupId: z.string().uuid('Invalid group id'),
    optionId: z.string().uuid('Invalid option id'),
  }),
  body: z
    .object({
      label: z.string().min(1).max(120).optional(),
      priceDelta: z.number().min(0).optional(),
      sortOrder: z.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'At least one field must be provided',
    }),
});

export const optionParamsSchema = z.object({
  params: z.object({
    dishId: z.string().uuid('Invalid dish id'),
    groupId: z.string().uuid('Invalid group id'),
    optionId: z.string().uuid('Invalid option id'),
  }),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>['body'];
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>['body'];
export type CreateDishInput = z.infer<typeof createDishSchema>['body'];
export type UpdateDishInput = z.infer<typeof updateDishSchema>['body'];
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>['body'];
export type UpdateVendorProfileInput = z.infer<typeof updateVendorProfileSchema>['body'];
export type CreateOptionGroupInput = z.infer<typeof createOptionGroupSchema>['body'];
export type UpdateOptionGroupInput = z.infer<typeof updateOptionGroupSchema>['body'];
export type CreateOptionInput = z.infer<typeof createOptionSchema>['body'];
export type UpdateOptionInput = z.infer<typeof updateOptionSchema>['body'];
