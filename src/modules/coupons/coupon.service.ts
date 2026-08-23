import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { CouponApplicableTo, CouponType } from '../../generated/prisma/enums.js';
import type { CreateCouponInput, UpdateCouponInput } from './coupon.schema.js';

type Tx = Prisma.TransactionClient;

export interface CouponValidationOptions {
  applicableTo?: CouponApplicableTo;
  amount?: number;
  userId?: string;
}

export interface CouponValidationResult {
  couponId: string;
  code: string;
  type: CouponType;
  discountAmount: number;
  finalAmount: number;
}

export class CouponService {
  // ---- Admin CRUD ----

  async createCoupon(data: CreateCouponInput): Promise<{ id: string }> {
    try {
      const coupon = await prisma.coupon.create({
        data: {
          ...data,
          validFrom: new Date(data.validFrom),
          validTo: new Date(data.validTo),
          minSpend: data.minSpend ?? null,
        },
      });
      return { id: coupon.id };
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw AppError.conflict('A coupon with this code already exists');
      }
      throw err;
    }
  }

  async listCoupons(
    page: number,
    limit: number,
    isActive?: boolean,
  ): Promise<{ items: unknown[]; page: number; limit: number; total: number }> {
    const where = isActive === undefined ? {} : { isActive };
    const [items, total] = await Promise.all([
      prisma.coupon.findMany({
        where,
        include: { _count: { select: { usages: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.coupon.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  async updateCoupon(id: string, data: UpdateCouponInput): Promise<{ id: string }> {
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound('Coupon not found');

    try {
      await prisma.coupon.update({
        where: { id },
        data: {
          ...data,
          validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
          validTo: data.validTo ? new Date(data.validTo) : undefined,
          minSpend: data.minSpend === null ? null : data.minSpend,
        },
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw AppError.conflict('A coupon with this code already exists');
      }
      throw err;
    }
    return { id };
  }

  async deleteCoupon(id: string): Promise<void> {
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound('Coupon not found');
    await prisma.coupon.delete({ where: { id } });
  }

  // ---- Validation & redemption ----

  /**
   * Validate a coupon without redeeming it. Used by the public GET /coupons/:code/validate
   * endpoint (and internally). Returns the coupon and the computed discount for `amount`.
   */
  async validateCoupon(
    code: string,
    opts: CouponValidationOptions = {},
  ): Promise<CouponValidationResult> {
    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon) throw AppError.notFound('Coupon not found');

    return this.validateCouponRow(coupon, opts);
  }

  /**
   * Validate and redeem a coupon inside a caller-owned transaction. Records a usage row,
   * enforcing global and per-user usage caps atomically. Returns the discount.
   */
  async redeemCoupon(
    tx: Tx,
    code: string,
    userId: string,
    context: { contextType: string; contextId: string },
    opts: CouponValidationOptions,
  ): Promise<CouponValidationResult> {
    const coupon = await tx.coupon.findUnique({ where: { code } });
    if (!coupon) throw AppError.notFound('Coupon not found');

    const result = await this.validateCouponRow(coupon, { ...opts, userId }, tx);

    const alreadyUsed = await tx.couponUsage.findUnique({
      where: {
        couponId_userId_contextType_contextId: {
          couponId: coupon.id,
          userId,
          contextType: context.contextType,
          contextId: context.contextId,
        },
      },
    });
    if (!alreadyUsed) {
      await tx.couponUsage.create({
        data: {
          couponId: coupon.id,
          userId,
          contextType: context.contextType,
          contextId: context.contextId,
          discountAmount: result.discountAmount,
        },
      });
    }
    return result;
  }

  private async validateCouponRow(
    coupon: {
      id: string;
      code: string;
      type: CouponType;
      value: unknown;
      maxUses: number;
      perUserUses: number;
      validFrom: Date;
      validTo: Date;
      applicableTo: CouponApplicableTo;
      minSpend: unknown;
      isActive: boolean;
    },
    opts: CouponValidationOptions,
    client: Tx = prisma,
  ): Promise<CouponValidationResult> {
    if (!coupon.isActive) throw AppError.conflict('This coupon is not active');
    const now = new Date();
    if (now < coupon.validFrom) throw AppError.conflict('This coupon has not started yet');
    if (now > coupon.validTo) throw AppError.conflict('This coupon has expired');

    if (opts.applicableTo && opts.applicableTo !== 'BOTH') {
      if (coupon.applicableTo !== 'BOTH' && coupon.applicableTo !== opts.applicableTo) {
        throw AppError.conflict(
          `This coupon only applies to ${coupon.applicableTo.toLowerCase()} purchases`,
        );
      }
    }

    const minSpend = coupon.minSpend === null ? null : Number(coupon.minSpend);
    if (opts.amount !== undefined && minSpend !== null && opts.amount < minSpend) {
      throw AppError.conflict(`This coupon requires a minimum spend of ${minSpend}`);
    }

    const [totalUses, userUses] = await Promise.all([
      client.couponUsage.count({ where: { couponId: coupon.id } }),
      opts.userId
        ? client.couponUsage.count({ where: { couponId: coupon.id, userId: opts.userId } })
        : Promise.resolve(0),
    ]);

    if (coupon.maxUses > 0 && totalUses >= coupon.maxUses) {
      throw AppError.conflict('This coupon has reached its usage limit');
    }
    if (opts.userId && userUses >= coupon.perUserUses) {
      throw AppError.conflict('You have already used this coupon');
    }

    const amount = opts.amount ?? 0;
    const discountAmount = this.computeDiscount(coupon.type, Number(coupon.value), amount);
    return {
      couponId: coupon.id,
      code: coupon.code,
      type: coupon.type,
      discountAmount,
      finalAmount: Math.max(0, amount - discountAmount),
    };
  }

  private computeDiscount(type: CouponType, value: number, amount: number): number {
    if (amount <= 0) return 0;
    if (type === 'FIXED') return Math.min(value, amount);
    return Math.round((amount * value) / 100);
  }

  private isUniqueViolation(err: unknown): boolean {
    return err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002';
  }
}

export const couponService = new CouponService();
