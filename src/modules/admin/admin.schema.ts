import { z } from 'zod';

const roleSchema = z.enum(['SUPER_ADMIN', 'ADMIN', 'FINANCIAL', 'VENDOR', 'OPERATOR', 'STUDENT']);

export const listAdminUsersSchema = z.object({
  querystring: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    role: roleSchema.optional(),
    search: z.string().min(1).max(100).optional(),
  }),
});

export const userIdParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user id'),
  }),
});

export const vendorIdParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid vendor id'),
  }),
});

export const operatorIdParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid operator id'),
  }),
});

export const listAuditLogsSchema = z.object({
  querystring: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    actorId: z.string().uuid('Invalid actor id').optional(),
    action: z.string().min(1).max(100).optional(),
    entity: z.string().min(1).max(100).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});

export const settingKeyParamsSchema = z.object({
  params: z.object({
    key: z.string().min(1).max(200),
  }),
});

export const upsertSettingSchema = z.object({
  body: z.object({
    value: z.unknown().refine((v) => v !== undefined, { message: 'value is required' }),
  }),
});
