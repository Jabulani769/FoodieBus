import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from '../../shared/config/index.js';
import type { Role } from '../../generated/prisma/enums.js';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  email: string;
  phone: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  jti: string;
}

export function signAccessToken(user: {
  id: string;
  role: Role;
  email: string;
  phone: string;
}): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    role: user.role,
    email: user.email,
    phone: user.phone,
    type: 'access',
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'foodiebus',
  });
}

export function signRefreshToken(userId: string): string {
  const payload: RefreshTokenPayload = { sub: userId, type: 'refresh', jti: randomUUID() };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'foodiebus',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'foodiebus',
    });
    if (typeof decoded === 'string' || decoded.type !== 'access') return null;
    return decoded as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: 'foodiebus',
    });
    if (typeof decoded === 'string' || decoded.type !== 'refresh') return null;
    return decoded as RefreshTokenPayload;
  } catch {
    return null;
  }
}
