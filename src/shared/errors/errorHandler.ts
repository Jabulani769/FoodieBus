import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './AppError.js';
import type { ZodError } from 'zod';
import { captureException } from '../sentry/index.js';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    request.log.warn({ code: error.code, message: error.message }, 'handled app error');
    reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });
    return;
  }

  const zodError = error as FastifyError & { validation?: unknown };
  if (zodError.validation) {
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: zodError.validation,
      },
    });
    return;
  }

  request.log.error({ err: error }, 'unhandled error');
  captureException(error);
  reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    },
  });
}

export function isZodError(error: unknown): error is ZodError {
  return error instanceof Error && 'issues' in error;
}
