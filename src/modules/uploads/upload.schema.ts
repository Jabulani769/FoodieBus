import { z } from 'zod';

export const uploadQuerySchema = z.object({
  category: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'Category must be lowercase alphanumeric (hyphens allowed)')
    .default('uploads'),
});

export type UploadQuery = z.infer<typeof uploadQuerySchema>;
