import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../../shared/config/env.js';
import { getStorageProvider } from '../../shared/storage/index.js';
import { authenticate, authorize } from '../../shared/middleware/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAuditLog } from '../../shared/audit/audit.js';
import { uploadQuerySchema } from './upload.schema.js';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function requireUser(request: FastifyRequest): NonNullable<typeof request.user> {
  if (!request.user) {
    throw AppError.unauthorized();
  }
  return request.user;
}

export async function registerUploadRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/uploads',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      preHandler: [
        authenticate,
        authorize('STUDENT', 'VENDOR', 'OPERATOR', 'ADMIN', 'SUPER_ADMIN'),
      ],
      schema: {
        tags: ['uploads'],
        summary: 'Upload an image file and get a public URL back',
        description:
          'Accepts a multipart form upload (field name "file") of type image/jpeg, image/png, or ' +
          'image/webp, capped at the configured max size. Returns a URL to store in imageUrl/logoUrl.',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              default: 'uploads',
              pattern: '^[a-z0-9-]+$',
            },
          },
        },
        consumes: ['multipart/form-data'],
        response: {
          201: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              key: { type: 'string' },
            },
            required: ['url', 'key'],
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { category } = uploadQuerySchema.parse(request.query);

      const file = await request.file();
      if (!file) {
        throw AppError.validation('A file is required (multipart field "file")');
      }

      const allowedTypes = env.STORAGE_ALLOWED_TYPES.split(',').map((t) => t.trim());
      if (!allowedTypes.includes(file.mimetype)) {
        file.file.resume();
        throw AppError.validation(`Unsupported file type: ${file.mimetype}`);
      }

      const ext = MIME_TO_EXT[file.mimetype] ?? 'bin';
      const key = `${category}/${randomUUID()}.${ext}`;
      const maxBytes = env.STORAGE_MAX_SIZE_MB * 1024 * 1024;

      let size = 0;
      const limiter = new Transform({
        transform(chunk, _encoding, callback) {
          size += chunk.length;
          if (size > maxBytes) {
            callback(AppError.validation(`File exceeds the ${env.STORAGE_MAX_SIZE_MB}MB limit`));
            return;
          }
          callback(null, chunk);
        },
      });
      file.file.pipe(limiter);
      limiter.on('error', () => {
        // Error is re-thrown by provider.upload via pipeline; swallowing here
        // prevents an unhandled 'error' event on the pipe boundary.
      });

      const provider = getStorageProvider();
      const uploaded = await provider.upload({
        key,
        contentType: file.mimetype,
        body: limiter,
      });

      await writeAuditLog({
        actorId: actor.id,
        action: 'upload.create',
        entity: 'upload',
        entityId: key,
        details: { category, contentType: file.mimetype, size },
        ipAddress: request.ip,
      });

      return reply.code(201).send({ url: uploaded.url, key });
    },
  );
}
