import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/AppError.js';
import type { Role } from '../../generated/prisma/enums.js';
import { verifyAccessToken } from '../../modules/auth/jwt.js';

export function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearerToken(request);
  if (!token) {
    throw AppError.unauthorized();
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    throw AppError.unauthorized('Invalid or expired access token');
  }

  request.user = {
    id: payload.sub,
    role: payload.role,
    email: payload.email,
    phone: payload.phone,
  };
}

export async function authenticateOptional(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const token = extractBearerToken(request);
  if (!token) return;
  const payload = verifyAccessToken(token);
  if (!payload) return;
  request.user = {
    id: payload.sub,
    role: payload.role,
    email: payload.email,
    phone: payload.phone,
  };
}

export function authorize(...allowedRoles: Role[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const user = request.user;
    if (!user) {
      throw AppError.unauthorized();
    }
    if (!allowedRoles.includes(user.role)) {
      throw AppError.forbidden();
    }
  };
}

export function requireRole(roles: Role[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const user = request.user;
    if (!user) {
      throw AppError.unauthorized();
    }
    if (!roles.includes(user.role)) {
      throw AppError.forbidden();
    }
  };
}
