import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { env } from '../../shared/config/env.js';
import type { CreatePromotionInput } from './promotion.schema.js';

export const PROMOTION_RATE_KEY = 'promotion.daily_rate_mwk';

export interface PromotionInlineParams {
  id: string;
  txRef: string;
  amountMWK: string;
  currency: 'MWK';
  publicKey: string;
  callbackUrl?: string;
  returnUrl?: string;
  customer: { email?: string; firstName?: string; lastName?: string };
  customization: { title: string; description?: string };
  meta: { kind: 'promotion'; promotionId: string; vendorId: string };
}

export async function getDailyRate(): Promise<number> {
  const setting = await prisma.platformSetting.findUnique({ where: { key: PROMOTION_RATE_KEY } });
  if (setting) {
    const raw = (setting.value as unknown as { amount?: unknown; value?: unknown }) ?? {};
    const candidate =
      typeof setting.value === 'number'
        ? setting.value
        : typeof raw === 'object' && raw !== null
          ? ((raw as Record<string, unknown>).amount ?? (raw as Record<string, unknown>).value)
          : undefined;
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return env.PROMOTION_DAILY_RATE_MWK;
}

function daysLeft(endsAt: Date): number {
  return Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000));
}

export class PromotionService {
  async quote(dishId: string, vendorId: string, days: number) {
    await this.assertOwnDish(dishId, vendorId);
    const dailyRate = await getDailyRate();
    return { dishId, days, dailyRate, amountMWK: dailyRate * days, currency: 'MWK' };
  }

  async create(vendorId: string, data: CreatePromotionInput) {
    const dish = await this.assertOwnDish(data.dishId, vendorId);
    if (!dish.isAvailable) {
      throw AppError.conflict('Dish must be available before it can be promoted');
    }
    const dailyRate = await getDailyRate();
    const amountMWK = dailyRate * data.days;

    // One live promotion per dish — prevents double-billing the same meal.
    const live = await prisma.promotion.findFirst({
      where: {
        dishId: data.dishId,
        status: { in: ['PENDING_PAYMENT', 'SCHEDULED', 'ACTIVE'] },
      },
      select: { id: true },
    });
    if (live) {
      throw AppError.conflict('This dish already has an active or pending promotion');
    }

    const startsAt = data.startsAt ? new Date(data.startsAt) : new Date();
    if (Number.isNaN(startsAt.getTime())) throw AppError.validation('Invalid startsAt');
    const endsAt = new Date(startsAt.getTime() + data.days * 86_400_000);

    const promotion = await prisma.promotion.create({
      data: {
        vendorId,
        dishId: data.dishId,
        headline: data.headline.trim(),
        description: data.description?.trim() || null,
        imageUrl: data.imageUrl?.trim() || dish.imageUrl,
        days: data.days,
        amountMWK,
        startsAt,
        endsAt,
        status: 'PENDING_PAYMENT',
      },
    });
    return { id: promotion.id, amountMWK: promotion.amountMWK.toString(), startsAt, endsAt };
  }

  /**
   * Drop-in (inline popup) params — no redirect, no new tab.
   * The vendor page feeds these straight into PayChangu's `PaychanguCheckout()`
   * overlay (`in.paychangu.com/js/popup.js`). The txRef is reserved on the
   * promotion first, so the webhook + manual verify can match the payment.
   * No server-to-PayChangu call happens here; the popup talks to PayChangu
   * directly with the public key.
   */
  async inlineParams(
    promotionId: string,
    vendorId: string,
    opts: { returnUrl?: string } = {},
  ): Promise<PromotionInlineParams> {
    const promotion = await prisma.promotion.findUnique({
      where: { id: promotionId },
      include: {
        dish: { select: { name: true } },
        vendor: { select: { businessName: true, userId: true } },
      },
    });
    if (!promotion) throw AppError.notFound('Promotion not found');
    if (promotion.vendorId !== vendorId) throw AppError.forbidden('Not your promotion');
    if (!['PENDING_PAYMENT', 'SCHEDULED'].includes(promotion.status)) {
      throw AppError.conflict(`Promotion is ${promotion.status.toLowerCase()} and cannot be paid`);
    }
    if (!env.PAYCHANGU_PUBLIC_KEY) {
      throw AppError.internal('PayChangu is not configured (PAYCHANGU_PUBLIC_KEY missing)');
    }

    const txRef = promotion.txRef ?? `PROMO-${randomUUID()}`;
    if (!promotion.txRef) {
      await prisma.promotion.update({ where: { id: promotion.id }, data: { txRef } });
    }

    const user = await prisma.user.findUnique({
      where: { id: promotion.vendor.userId },
      select: { email: true, fullName: true },
    });
    const [firstName, ...rest] = (user?.fullName ?? promotion.vendor.businessName).split(' ');

    return {
      id: promotion.id,
      txRef,
      amountMWK: promotion.amountMWK.toString(),
      currency: 'MWK',
      publicKey: env.PAYCHANGU_PUBLIC_KEY,
      callbackUrl: env.PAYCHANGU_CALLBACK_URL,
      returnUrl: opts.returnUrl ?? env.PAYCHANGU_RETURN_URL,
      customer: {
        email: user?.email,
        firstName: firstName || promotion.vendor.businessName,
        lastName: rest.join(' ') || undefined,
      },
      customization: {
        title: `Promotion: ${promotion.dish.name}`,
        description: promotion.headline,
      },
      meta: { kind: 'promotion', promotionId: promotion.id, vendorId },
    };
  }

  /** Called after PayChangu confirms `txRef` as paid (webhook or manual verify). */
  async confirmByTxRef(txRef: string) {
    const promotion = await prisma.promotion.findUnique({ where: { txRef } });
    if (!promotion) return null;
    if (['ACTIVE', 'SCHEDULED', 'EXPIRED', 'CANCELLED'].includes(promotion.status)) {
      return promotion;
    }
    const now = new Date();
    const status = promotion.startsAt.getTime() <= now.getTime() ? 'ACTIVE' : 'SCHEDULED';
    return prisma.promotion.update({ where: { id: promotion.id }, data: { status } });
  }

  async listMine(vendorId: string, status?: string) {
    const items = await prisma.promotion.findMany({
      where: { vendorId, ...(status ? { status: status as never } : {}) },
      include: {
        dish: { select: { id: true, name: true, price: true, imageUrl: true, isAvailable: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: items.map((p) => ({
        ...p,
        amountMWK: p.amountMWK.toString(),
        daysLeft: daysLeft(p.endsAt),
      })),
    };
  }

  /**
   * Public feed for the app promo card: dish + restaurant name/logo + validity + words.
   * Only live, paid, in-stock promotions from open vendors.
   */
  async listActive(page: number, limit: number, vendorId?: string) {
    const now = new Date();
    const items = await prisma.promotion.findMany({
      where: {
        status: 'ACTIVE',
        endsAt: { gt: now },
        startsAt: { lte: now },
        ...(vendorId ? { vendorId } : {}),
        dish: { isAvailable: true },
        vendor: { isActive: true, isPaused: false },
      },
      include: {
        dish: { select: { id: true, name: true, price: true, imageUrl: true } },
        vendor: { select: { id: true, businessName: true, logoUrl: true, city: true } },
      },
      orderBy: { endsAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const total = await prisma.promotion.count({
      where: {
        status: 'ACTIVE',
        endsAt: { gt: now },
        startsAt: { lte: now },
        ...(vendorId ? { vendorId } : {}),
        dish: { isAvailable: true },
        vendor: { isActive: true, isPaused: false },
      },
    });
    return {
      items: items.map((p) => ({
        id: p.id,
        headline: p.headline,
        description: p.description,
        imageUrl: p.imageUrl ?? p.dish.imageUrl,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        daysLeft: daysLeft(p.endsAt),
        dish: { ...p.dish, price: p.dish.price.toString() },
        vendor: p.vendor,
      })),
      page,
      limit,
      total,
    };
  }

  async cancel(promotionId: string, vendorId: string) {
    const promotion = await prisma.promotion.findUnique({ where: { id: promotionId } });
    if (!promotion) throw AppError.notFound('Promotion not found');
    if (promotion.vendorId !== vendorId) throw AppError.forbidden('Not your promotion');
    if (!['PENDING_PAYMENT', 'SCHEDULED'].includes(promotion.status)) {
      throw AppError.conflict('Only unpaid or scheduled promotions can be cancelled');
    }
    await prisma.promotion.update({ where: { id: promotionId }, data: { status: 'CANCELLED' } });
    return { id: promotionId };
  }

  /** Expiry sweeper — safe to run every few minutes. Returns count expired. */
  async expireDue(now = new Date()): Promise<number> {
    const due = await prisma.promotion.findMany({
      where: { status: { in: ['ACTIVE', 'SCHEDULED'] }, endsAt: { lte: now } },
      select: { id: true },
    });
    if (due.length === 0) return 0;
    await prisma.promotion.updateMany({
      where: { id: { in: due.map((d) => d.id) } },
      data: { status: 'EXPIRED' },
    });
    // Promote scheduled → active whose window has opened.
    await prisma.promotion.updateMany({
      where: { status: 'SCHEDULED', startsAt: { lte: now }, endsAt: { gt: now } },
      data: { status: 'ACTIVE' },
    });
    return due.length;
  }

  private async assertOwnDish(dishId: string, vendorId: string) {
    const dish = await prisma.dish.findUnique({ where: { id: dishId } });
    if (!dish) throw AppError.notFound('Dish not found');
    if (dish.vendorId !== vendorId)
      throw AppError.forbidden('You can only promote your own dishes');
    return dish;
  }
}

export const promotionService = new PromotionService();
