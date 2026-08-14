import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAuditLog } from '../../shared/audit/audit.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Role } from '../../generated/prisma/enums.js';

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export class AdminService {
  async getDashboardStats(): Promise<unknown> {
    const [usersByRole, bookingsByStatus, revenueAgg, vendors, operators, pendingBookings] =
      await Promise.all([
        prisma.user.groupBy({ by: ['role'], _count: { _all: true }, where: { deletedAt: null } }),
        prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.payment.aggregate({
          where: { status: 'PAID' },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.vendorProfile.count({ where: { isActive: true } }),
        prisma.operatorProfile.count({ where: { isActive: true } }),
        prisma.booking.count({ where: { status: 'PENDING' } }),
      ]);

    return {
      users: Object.fromEntries(usersByRole.map((r) => [r.role, r._count._all])),
      totalUsers: usersByRole.reduce((sum, r) => sum + r._count._all, 0),
      bookings: Object.fromEntries(bookingsByStatus.map((b) => [b.status, b._count._all])),
      totalBookings: bookingsByStatus.reduce((sum, b) => sum + b._count._all, 0),
      pendingBookings,
      revenue: {
        total: revenueAgg._sum.amount?.toString() ?? '0',
        paidPayments: revenueAgg._count,
      },
      activeVendors: vendors,
      activeOperators: operators,
    };
  }

  async listUsers(
    page: number,
    limit: number,
    filters: { role?: Role; search?: string } = {},
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (filters.role) where.role = filters.role;
    if (filters.search) {
      where.OR = [
        { fullName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  async getUserDetail(userId: string): Promise<unknown> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        vendorProfile: true,
        operatorProfile: true,
        _count: {
          select: {
            bookings: true,
            notifications: true,
            refreshTokens: true,
          },
        },
      },
    });
    if (!user) throw AppError.notFound('User not found');
    return user;
  }

  async toggleUserStatus(
    userId: string,
    actorId: string,
    actorRole: Role,
  ): Promise<{ id: string; isActive: boolean }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User not found');
    if (user.role === 'SUPER_ADMIN' && user.id !== actorId) {
      throw AppError.forbidden('Cannot change the status of another super admin');
    }

    const isActive = !user.isActive;
    await prisma.user.update({ where: { id: userId }, data: { isActive } });
    await writeAuditLog({
      actorId,
      action: 'admin.user_status',
      entity: 'user',
      entityId: userId,
      details: { isActive, role: actorRole },
    });
    return { id: userId, isActive };
  }

  async softDeleteUser(userId: string, actorId: string, actorRole: Role): Promise<{ id: string }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User not found');
    if (user.role === 'SUPER_ADMIN' && user.id !== actorId) {
      throw AppError.forbidden('Cannot delete another super admin');
    }
    if (user.deletedAt !== null) throw AppError.conflict('User is already deleted');

    await prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), isActive: false },
    });
    await writeAuditLog({
      actorId,
      action: 'admin.user_delete',
      entity: 'user',
      entityId: userId,
      details: { role: actorRole },
    });
    return { id: userId };
  }

  async toggleVendorStatus(
    vendorId: string,
    actorId: string,
    actorRole: Role,
  ): Promise<{ id: string; isActive: boolean }> {
    const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorId } });
    if (!vendor) throw AppError.notFound('Vendor not found');
    const isActive = !vendor.isActive;
    await prisma.vendorProfile.update({ where: { id: vendorId }, data: { isActive } });
    await writeAuditLog({
      actorId,
      action: 'admin.vendor_status',
      entity: 'vendor',
      entityId: vendorId,
      details: { isActive, role: actorRole },
    });
    return { id: vendorId, isActive };
  }

  async toggleOperatorStatus(
    operatorId: string,
    actorId: string,
    actorRole: Role,
  ): Promise<{ id: string; isActive: boolean }> {
    const operator = await prisma.operatorProfile.findUnique({ where: { id: operatorId } });
    if (!operator) throw AppError.notFound('Operator not found');
    const isActive = !operator.isActive;
    await prisma.operatorProfile.update({ where: { id: operatorId }, data: { isActive } });
    await writeAuditLog({
      actorId,
      action: 'admin.operator_status',
      entity: 'operator',
      entityId: operatorId,
      details: { isActive, role: actorRole },
    });
    return { id: operatorId, isActive };
  }

  async listAuditLogs(
    page: number,
    limit: number,
    filters: { actorId?: string; action?: string; entity?: string; from?: Date; to?: Date } = {},
  ): Promise<PaginatedResult<unknown>> {
    const where: {
      actorId?: string;
      action?: string;
      entity?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = {};
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.action) where.action = filters.action;
    if (filters.entity) where.entity = filters.entity;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from;
      if (filters.to) where.createdAt.lte = filters.to;
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, email: true, fullName: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  async listSettings(): Promise<unknown[]> {
    return prisma.platformSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async getSetting(key: string): Promise<unknown> {
    const setting = await prisma.platformSetting.findUnique({ where: { key } });
    if (!setting) throw AppError.notFound(`Setting "${key}" not found`);
    return setting;
  }

  async upsertSetting(
    key: string,
    value: unknown,
    actorId: string,
    actorRole: Role,
  ): Promise<unknown> {
    const setting = await prisma.platformSetting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
    await writeAuditLog({
      actorId,
      action: 'admin.setting_upsert',
      entity: 'platform_setting',
      entityId: key,
      details: { key, role: actorRole },
    });
    return setting;
  }
}

export const adminService = new AdminService();
