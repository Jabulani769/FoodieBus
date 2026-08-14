import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    identifier: z.string().min(3, 'Identifier is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const logoutSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

const roleSchema = z.enum(['SUPER_ADMIN', 'ADMIN', 'FINANCIAL', 'VENDOR', 'OPERATOR', 'STUDENT']);

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    phone: z.string().regex(/^\+?\d{9,15}$/, 'Invalid phone number'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    fullName: z.string().min(1, 'Full name is required'),
    role: roleSchema,
  }),
});

export const updateUserSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user id'),
  }),
  body: z
    .object({
      role: roleSchema.optional(),
      isActive: z.boolean().optional(),
      fullName: z.string().min(1).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'At least one field must be provided',
    }),
});

export const listUsersSchema = z.object({
  querystring: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    role: roleSchema.optional(),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    identifier: z.string().min(3, 'Email or phone is required'),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    identifier: z.string().min(3, 'Email or phone is required'),
    code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  }),
});

export const inviteUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    phone: z.string().regex(/^\+?\d{9,15}$/, 'Invalid phone number'),
    fullName: z.string().min(1, 'Full name is required'),
    role: roleSchema,
  }),
});

export const verifyInviteSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>['body'];
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
