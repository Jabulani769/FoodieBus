import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { hashPassword, verifyPassword } from './password.js';
import { signAccessToken, signRefreshToken } from './jwt.js';
import { writeAuditLog } from '../../shared/audit/audit.js';
import { createHash } from 'node:crypto';
import type { Role } from '../../generated/prisma/enums.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_MS);
}

export class AuthService {
  async login(identifier: string, password: string, ctx: AuthContext = {}): Promise<TokenPair> {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier.toLowerCase() }, { phone: identifier }],
      },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw AppError.unauthorized('Invalid credentials');
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      throw AppError.unauthorized('Invalid credentials');
    }

    const tokens = await this.issueTokens(user, ctx);
    await writeAuditLog({
      actorId: user.id,
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      ipAddress: ctx.ipAddress ?? null,
    });
    return tokens;
  }

  async refresh(refreshToken: string, ctx: AuthContext = {}): Promise<TokenPair> {
    const tokenHash = hashToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) {
      throw AppError.unauthorized('Invalid refresh token');
    }

    // Reuse detection: a revoked token presented again revokes the whole family.
    if (stored.revokedAt !== null) {
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await writeAuditLog({
        actorId: stored.userId,
        action: 'auth.refresh_reuse_detected',
        entity: 'refresh_token',
        entityId: stored.id,
        ipAddress: ctx.ipAddress ?? null,
      });
      throw AppError.unauthorized('Refresh token reuse detected');
    }

    if (stored.expiresAt < new Date()) {
      throw AppError.unauthorized('Refresh token expired');
    }

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.isActive || user.deletedAt !== null) {
      throw AppError.unauthorized('User no longer active');
    }

    // Rotate: revoke the current token, issue a new pair.
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const { accessToken, refreshToken: newRefreshToken } = await this.issueTokens(user, ctx);

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { replacedBy: hashToken(newRefreshToken) },
    });

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(
    user: { id: string; role: Role; email: string; phone: string },
    ctx: AuthContext,
  ): Promise<TokenPair> {
    const accessToken = signAccessToken({
      id: user.id,
      role: user.role,
      email: user.email,
      phone: user.phone,
    });
    const refreshToken = signRefreshToken(user.id);

    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId: user.id,
        expiresAt: refreshExpiry(),
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });

    return { accessToken, refreshToken };
  }
}

export const authService = new AuthService();

export async function createUser(input: {
  email: string;
  phone: string;
  password: string;
  fullName: string;
  role: Role;
}): Promise<{ id: string }> {
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      phone: input.phone,
      passwordHash,
      fullName: input.fullName,
      role: input.role,
    },
    select: { id: true },
  });

  await ensureVendorProfile(user.id, input.fullName, input.role);
  await ensureOperatorProfile(user.id, input.fullName, input.role);
  return user;
}

export async function ensureVendorProfile(
  userId: string,
  fullName: string,
  role: Role,
): Promise<void> {
  if (role !== 'VENDOR') return;
  const existing = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (existing) return;
  await prisma.vendorProfile.create({
    data: {
      userId,
      businessName: fullName,
    },
  });
}

export async function ensureOperatorProfile(
  userId: string,
  fullName: string,
  role: Role,
): Promise<void> {
  if (role !== 'OPERATOR') return;
  const existing = await prisma.operatorProfile.findUnique({ where: { userId } });
  if (existing) return;
  await prisma.operatorProfile.create({
    data: {
      userId,
      businessName: fullName,
    },
  });
}
