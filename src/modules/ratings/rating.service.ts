import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import type { CreateRatingInput, UpdateRatingInput } from './rating.schema.js';
import type { RatingEntityType } from '../../generated/prisma/enums.js';

export interface RatingSummary {
  average: number;
  count: number;
}

export class RatingService {
  async createRating(userId: string, data: CreateRatingInput): Promise<{ id: string }> {
    await this.ensureEntityExists(data.entityType, data.entityId);
    await this.assertEligible(userId, data.entityType, data.entityId);

    try {
      const rating = await prisma.rating.create({
        data: {
          userId,
          entityType: data.entityType,
          entityId: data.entityId,
          score: data.score,
          comment: data.comment,
        },
        select: { id: true },
      });
      return rating;
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw AppError.conflict('You have already rated this entity');
      }
      throw err;
    }
  }

  async updateOwnRating(
    ratingId: string,
    userId: string,
    data: UpdateRatingInput,
  ): Promise<{ id: string }> {
    const rating = await prisma.rating.findUnique({ where: { id: ratingId } });
    if (!rating) throw AppError.notFound('Rating not found');
    if (rating.userId !== userId) {
      throw AppError.forbidden('You can only update your own ratings');
    }

    await prisma.rating.update({
      where: { id: ratingId },
      data: {
        score: data.score,
        comment: data.comment,
      },
    });
    return { id: ratingId };
  }

  async deleteOwnRating(ratingId: string, userId: string): Promise<void> {
    const rating = await prisma.rating.findUnique({ where: { id: ratingId } });
    if (!rating) throw AppError.notFound('Rating not found');
    if (rating.userId !== userId) {
      throw AppError.forbidden('You can only delete your own ratings');
    }

    await prisma.rating.delete({ where: { id: ratingId } });
  }

  async listRatings(
    entityType: RatingEntityType | undefined,
    entityId: string | undefined,
    page: number,
    limit: number,
  ): Promise<{ items: unknown[]; page: number; limit: number; total: number }> {
    const where = {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.rating.findMany({
        where,
        include: { user: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.rating.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  async getRatingSummary(entityType: RatingEntityType, entityId: string): Promise<RatingSummary> {
    const agg = await prisma.rating.aggregate({
      where: { entityType, entityId },
      _avg: { score: true },
      _count: { _all: true },
    });
    return {
      average: agg._avg.score ? Number(agg._avg.score.toFixed(2)) : 0,
      count: agg._count._all,
    };
  }

  private async ensureEntityExists(entityType: RatingEntityType, entityId: string): Promise<void> {
    const exists =
      entityType === 'TRIP'
        ? await prisma.trip.findUnique({ where: { id: entityId }, select: { id: true } })
        : entityType === 'DISH'
          ? await prisma.dish.findUnique({ where: { id: entityId }, select: { id: true } })
          : entityType === 'OPERATOR'
            ? await prisma.operatorProfile.findUnique({
                where: { id: entityId },
                select: { id: true },
              })
            : await prisma.vendorProfile.findUnique({
                where: { id: entityId },
                select: { id: true },
              });
    if (!exists) throw AppError.notFound('The entity you are rating does not exist');
  }

  private async assertEligible(
    userId: string,
    entityType: RatingEntityType,
    entityId: string,
  ): Promise<void> {
    if (entityType === 'TRIP') {
      const booking = await prisma.booking.findFirst({
        where: { passengerId: userId, tripId: entityId, status: 'CONFIRMED' },
        select: { id: true },
      });
      if (!booking) {
        throw AppError.forbidden('You can only rate trips you have a confirmed booking on');
      }
      return;
    }

    if (entityType === 'OPERATOR') {
      const booking = await prisma.booking.findFirst({
        where: {
          passengerId: userId,
          status: 'CONFIRMED',
          trip: { operatorId: entityId },
        },
        select: { id: true },
      });
      if (!booking) {
        throw AppError.forbidden('You can only rate operators you have travelled with');
      }
      return;
    }

    if (entityType === 'DISH') {
      const item = await prisma.foodOrderItem.findFirst({
        where: {
          dishId: entityId,
          foodOrder: { passengerId: userId, status: 'DELIVERED_TO_BUS' },
        },
        select: { id: true },
      });
      if (!item) {
        throw AppError.forbidden('You can only rate dishes you have ordered and received');
      }
      return;
    }

    const order = await prisma.foodOrder.findFirst({
      where: { vendorId: entityId, passengerId: userId, status: 'DELIVERED_TO_BUS' },
      select: { id: true },
    });
    if (!order) {
      throw AppError.forbidden('You can only rate vendors you have ordered from');
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002';
  }
}

export const ratingService = new RatingService();
