import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import type { AddFavoriteInput } from './favorite.schema.js';

export class FavoriteService {
  async addFavorite(userId: string, data: AddFavoriteInput): Promise<{ id: string }> {
    if (data.dishId) {
      const dish = await prisma.dish.findUnique({
        where: { id: data.dishId },
        select: { id: true },
      });
      if (!dish) throw AppError.notFound('Dish not found');
    }
    if (data.vendorId) {
      const vendor = await prisma.vendorProfile.findUnique({
        where: { id: data.vendorId },
        select: { id: true },
      });
      if (!vendor) throw AppError.notFound('Vendor not found');
    }

    try {
      const favorite = await prisma.favorite.create({
        data: { userId, dishId: data.dishId ?? null, vendorId: data.vendorId ?? null },
      });
      return { id: favorite.id };
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw AppError.conflict('This item is already in your favorites');
      }
      throw err;
    }
  }

  async listFavorites(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: unknown[]; page: number; limit: number; total: number }> {
    const [items, total] = await Promise.all([
      prisma.favorite.findMany({
        where: { userId },
        include: {
          dish: {
            select: {
              id: true,
              name: true,
              price: true,
              imageUrl: true,
              isAvailable: true,
              vendor: { select: { id: true, businessName: true } },
            },
          },
          vendor: {
            select: {
              id: true,
              businessName: true,
              description: true,
              logoUrl: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.favorite.count({ where: { userId } }),
    ]);
    return { items, page, limit, total };
  }

  async removeFavorite(favoriteId: string, userId: string): Promise<void> {
    const favorite = await prisma.favorite.findUnique({ where: { id: favoriteId } });
    if (!favorite) throw AppError.notFound('Favorite not found');
    if (favorite.userId !== userId) {
      throw AppError.forbidden('You can only remove your own favorites');
    }
    await prisma.favorite.delete({ where: { id: favoriteId } });
  }

  /** Most-favorited dishes/vendors across the catalog, for discovery surfaces. */
  async topFavorites(limit = 10): Promise<{ topDishes: unknown[]; topVendors: unknown[] }> {
    const [dishGroups, vendorGroups] = await Promise.all([
      prisma.favorite.groupBy({
        by: ['dishId'],
        where: { dishId: { not: null } },
        _count: { dishId: true },
        orderBy: { _count: { dishId: 'desc' } },
        take: limit,
      }),
      prisma.favorite.groupBy({
        by: ['vendorId'],
        where: { vendorId: { not: null } },
        _count: { vendorId: true },
        orderBy: { _count: { vendorId: 'desc' } },
        take: limit,
      }),
    ]);

    const dishIds = dishGroups.map((d) => d.dishId).filter(Boolean) as string[];
    const vendorIds = vendorGroups.map((v) => v.vendorId).filter(Boolean) as string[];

    const [dishes, vendors] = await Promise.all([
      dishIds.length
        ? prisma.dish.findMany({
            where: { id: { in: dishIds } },
            select: {
              id: true,
              name: true,
              price: true,
              imageUrl: true,
              isAvailable: true,
              vendor: { select: { id: true, businessName: true } },
            },
          })
        : Promise.resolve([]),
      vendorIds.length
        ? prisma.vendorProfile.findMany({
            where: { id: { in: vendorIds } },
            select: {
              id: true,
              businessName: true,
              description: true,
              logoUrl: true,
              isActive: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const dishCount = new Map(dishGroups.map((d) => [d.dishId, d._count.dishId]));
    const vendorCount = new Map(vendorGroups.map((v) => [v.vendorId, v._count.vendorId]));

    const topDishes = dishes
      .map((dish) => ({ ...dish, favoriteCount: dishCount.get(dish.id) ?? 0 }))
      .sort((a, b) => b.favoriteCount - a.favoriteCount);
    const topVendors = vendors
      .map((vendor) => ({ ...vendor, favoriteCount: vendorCount.get(vendor.id) ?? 0 }))
      .sort((a, b) => b.favoriteCount - a.favoriteCount);

    return { topDishes, topVendors };
  }

  private isUniqueViolation(err: unknown): boolean {
    return err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002';
  }
}

export const favoriteService = new FavoriteService();
