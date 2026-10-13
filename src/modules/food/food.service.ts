import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { ratingService } from '../ratings/rating.service.js';
import { haversineKm, estimateEtaMinutes, formatDistanceEta } from '../../shared/geo.js';
import { getVendorStatus } from '../../shared/vendor-status.js';
import { slugify } from './food.schema.js';
import type {
  CreateCategoryInput,
  CreateDishInput,
  CreateOptionGroupInput,
  CreateOptionInput,
  UpdateAvailabilityInput,
  UpdateCategoryInput,
  UpdateDishInput,
  UpdateOptionGroupInput,
  UpdateOptionInput,
  UpdateVendorProfileInput,
} from './food.schema.js';

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export class FoodService {
  // ---- Categories ----

  async listCategories(opts: { search?: string; includeInactive?: boolean } = {}): Promise<{
    items: unknown[];
  }> {
    const where: Record<string, unknown> = {};
    if (!opts.includeInactive) {
      where.isActive = true;
    }
    if (opts.search) {
      const q = opts.search;
      Object.assign(where, {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { slug: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    const items = await prisma.foodCategory.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { items };
  }

  async createCategory(data: CreateCategoryInput): Promise<{ id: string }> {
    try {
      const slug = data.slug ?? slugify(data.name);
      const category = await prisma.foodCategory.create({
        data: { name: data.name, slug, sortOrder: data.sortOrder ?? 0 },
      });
      return { id: category.id };
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw AppError.conflict('Category name or slug already exists');
      }
      throw err;
    }
  }

  /** Vendor-friendly find-or-create (searchable dropdown + custom creation). */
  async findOrCreateCategory(name: string): Promise<{ id: string; created: boolean }> {
    const trimmed = name.trim();
    if (!trimmed) throw AppError.validation('Category name is required');
    const slug = slugify(trimmed);
    const existing =
      (await prisma.foodCategory.findFirst({
        where: { slug },
      })) ??
      (await prisma.foodCategory.findFirst({
        where: { name: { equals: trimmed, mode: 'insensitive' } },
      }));
    if (existing) return { id: existing.id, created: false };
    try {
      const created = await prisma.foodCategory.create({ data: { name: trimmed, slug } });
      return { id: created.id, created: true };
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        const retry = await prisma.foodCategory.findFirst({ where: { slug } });
        if (retry) return { id: retry.id, created: false };
        throw AppError.conflict('Category name or slug already exists');
      }
      throw err;
    }
  }

  async reorderCategories(
    items: { id: string; sortOrder: number }[],
  ): Promise<{ updated: number }> {
    await prisma.$transaction(
      items.map((i) =>
        prisma.foodCategory.update({ where: { id: i.id }, data: { sortOrder: i.sortOrder } }),
      ),
    );
    return { updated: items.length };
  }

  async updateCategory(id: string, data: UpdateCategoryInput): Promise<{ id: string }> {
    const existing = await prisma.foodCategory.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound('Category not found');

    try {
      await prisma.foodCategory.update({ where: { id }, data });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw AppError.conflict('Category name or slug already exists');
      }
      throw err;
    }
    return { id };
  }

  async deleteCategory(id: string): Promise<void> {
    const existing = await prisma.foodCategory.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound('Category not found');

    const dishCount = await prisma.dish.count({ where: { categoryId: id } });
    if (dishCount > 0) {
      throw AppError.conflict('Cannot delete a category that still has dishes');
    }

    await prisma.foodCategory.delete({ where: { id } });
  }

  // ---- Vendor profiles ----

  async listVendors(
    page: number,
    limit: number,
    opts: {
      includeInactive?: boolean;
      categoryId?: string;
      categorySlug?: string;
      lat?: number;
      lng?: number;
      radiusKm?: number;
      onlyOpen?: boolean;
    } = {},
  ): Promise<PaginatedResult<unknown>> {
    const where: Record<string, unknown> = opts.includeInactive ? {} : { isActive: true };
    if (opts.categoryId || opts.categorySlug) {
      Object.assign(where, {
        dishes: {
          some: {
            ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
            ...(opts.categorySlug ? { category: { slug: opts.categorySlug } } : {}),
          },
        },
      });
    }
    const [itemsRaw, total] = await Promise.all([
      prisma.vendorProfile.findMany({
        where,
        include: {
          user: { select: { fullName: true, email: true } },
          operatingHours: true,
        },
        orderBy: { businessName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.vendorProfile.count({ where }),
    ]);

    let items: unknown[] = itemsRaw;
    // Geo filtering + distance/ETA enrichment
    if (opts.lat !== undefined && opts.lng !== undefined) {
      const enriched = itemsRaw
        .map((v) => {
          if (v.latitude == null || v.longitude == null) return null;
          const distanceKm = haversineKm(opts.lat!, opts.lng!, v.latitude, v.longitude);
          const radius = v.deliveryRadiusKm ?? 5;
          if (opts.radiusKm !== undefined && distanceKm > opts.radiusKm) return null;
          if (distanceKm > radius) return null; // hide out-of-radius (spec)
          const etaMin = estimateEtaMinutes(distanceKm, v.deliveryTime);
          return {
            ...v,
            distanceKm: Number(distanceKm.toFixed(2)),
            distanceM: Math.round(distanceKm * 1000),
            etaMin,
            distanceLabel: formatDistanceEta(distanceKm, etaMin),
          };
        })
        .filter(Boolean)
        .sort(
          (a, b) =>
            (a as { distanceKm: number }).distanceKm - (b as { distanceKm: number }).distanceKm,
        );
      items = enriched as unknown[];
    }

    if (opts.onlyOpen) {
      const filtered: unknown[] = [];
      for (const v of items as Array<{ id: string } & Record<string, unknown>>) {
        const s = await getVendorStatus(v.id);
        if (s.isOpen) filtered.push({ ...v, storeStatus: s.status, storeLabel: s.label });
      }
      return { items: filtered, page, limit, total: filtered.length };
    }

    // Attach status labels (open/closed/busy) without filtering
    const withStatus = await Promise.all(
      (items as Array<{ id: string } & Record<string, unknown>>).map(async (v) => {
        const s = await getVendorStatus(v.id);
        return { ...v, storeStatus: s.status, storeLabel: s.label, isOpen: s.isOpen };
      }),
    );
    return { items: withStatus, page, limit, total };
  }

  async getVendorById(id: string, opts: { includeInactive?: boolean } = {}): Promise<unknown> {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id },
      include: {
        user: { select: { fullName: true, email: true } },
        operatingHours: { orderBy: { dayOfWeek: 'asc' } },
      },
    });
    if (!vendor || (!opts.includeInactive && !vendor.isActive))
      throw AppError.notFound('Vendor not found');
    const status = await getVendorStatus(id);
    return {
      ...vendor,
      storeStatus: status.status,
      storeLabel: status.label,
      isOpen: status.isOpen,
    };
  }

  async getVendorByUserId(userId: string): Promise<unknown> {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { userId },
      include: { operatingHours: { orderBy: { dayOfWeek: 'asc' } } },
    });
    if (!vendor) throw AppError.notFound('Vendor profile not found');
    return vendor;
  }

  async updateVendorProfile(
    userId: string,
    data: UpdateVendorProfileInput,
  ): Promise<{ id: string }> {
    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) throw AppError.notFound('Vendor profile not found');

    // Second defense line: drop empties/NaN that slip past validation so a
    // partial tab save (business-only) can never wipe location fields or 400.
    const clean = Object.fromEntries(
      Object.entries(data).filter(
        ([, v]) => v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v)),
      ),
    );
    if (Object.keys(clean).length === 0) {
      throw AppError.validation('At least one field must be provided');
    }
    await prisma.vendorProfile.update({ where: { id: vendor.id }, data: clean });
    return { id: vendor.id };
  }

  async setVendorPaused(
    userId: string,
    isPaused: boolean,
  ): Promise<{ id: string; isPaused: boolean }> {
    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) throw AppError.notFound('Vendor profile not found');
    await prisma.vendorProfile.update({ where: { id: vendor.id }, data: { isPaused } });
    return { id: vendor.id, isPaused };
  }

  async upsertHours(
    userId: string,
    hours: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[],
  ): Promise<{ id: string }> {
    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) throw AppError.notFound('Vendor profile not found');
    await prisma.$transaction(
      hours.map((h) =>
        prisma.vendorOperatingHours.upsert({
          where: { vendorId_dayOfWeek: { vendorId: vendor.id, dayOfWeek: h.dayOfWeek } },
          create: { vendorId: vendor.id, ...h },
          update: { openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed },
        }),
      ),
    );
    return { id: vendor.id };
  }

  async getHours(vendorId: string): Promise<unknown[]> {
    return prisma.vendorOperatingHours.findMany({
      where: { vendorId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  // ---- Dishes ----

  private dishIncludeWithOptions() {
    return {
      category: { select: { id: true, name: true, slug: true } },
      optionGroups: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' as const },
        include: {
          options: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' as const },
          },
        },
      },
    };
  }

  async listVendorDishes(
    vendorId: string,
    page: number,
    limit: number,
    filters: { categoryId?: string; isAvailable?: boolean } = {},
  ): Promise<PaginatedResult<unknown>> {
    const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorId } });
    if (!vendor) throw AppError.notFound('Vendor not found');

    const where = {
      vendorId,
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.isAvailable !== undefined ? { isAvailable: filters.isAvailable } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.dish.findMany({
        where,
        include: this.dishIncludeWithOptions(),
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.dish.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  /** Grouped in-store menu view: headers in owner sort order. */
  async getVendorMenuGrouped(vendorId: string): Promise<{ groups: unknown[] }> {
    const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorId } });
    if (!vendor) throw AppError.notFound('Vendor not found');
    const now = new Date();
    const [dishes, livePromos] = await Promise.all([
      prisma.dish.findMany({
        where: { vendorId },
        include: this.dishIncludeWithOptions(),
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.promotion.findMany({
        where: {
          vendorId,
          status: 'ACTIVE',
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        select: { dishId: true, headline: true, endsAt: true },
      }),
    ]);
    const promoByDish = new Map(livePromos.map((p) => [p.dishId, p]));
    const map = new Map<
      string,
      { id: string; name: string; slug: string; sortOrder: number; items: unknown[] }
    >();
    for (const d of dishes) {
      const c = d.category as unknown as { id: string; name: string; slug: string } | null;
      // category relation may be missing select sortOrder; fetch via lookup below
      const key = c?.id ?? 'uncategorized';
      if (!map.has(key)) {
        map.set(key, {
          id: c?.id ?? 'uncategorized',
          name: (c as { name?: string })?.name ?? 'Uncategorized',
          slug: (c as { slug?: string })?.slug ?? 'uncategorized',
          sortOrder: 0,
          items: [],
        });
      }
      const unavailable = !d.isAvailable;
      const promo = promoByDish.get(d.id);
      map.get(key)!.items.push({
        ...d,
        badge: unavailable ? 'Unavailable Today' : promo ? 'Promoted' : null,
        locked: unavailable,
        isPromoted: !!promo && !unavailable,
        promotion: promo ? { headline: promo.headline, endsAt: promo.endsAt } : null,
      });
    }
    // Enrich sortOrder from categories
    const cats = await prisma.foodCategory.findMany({
      where: { id: { in: [...map.keys()].filter((k) => k !== 'uncategorized') } },
    });
    for (const c of cats) {
      const g = map.get(c.id);
      if (g) g.sortOrder = c.sortOrder;
    }
    const groups = [...map.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
    return { groups };
  }

  async getDishById(id: string): Promise<unknown> {
    const dish = await prisma.dish.findUnique({
      where: { id },
      include: {
        vendor: { select: { id: true, businessName: true } },
        ...this.dishIncludeWithOptions(),
      },
    });
    if (!dish) throw AppError.notFound('Dish not found');

    const rating = await ratingService.getRatingSummary('DISH', id);
    const unavailable = !(dish as { isAvailable: boolean }).isAvailable;
    return {
      ...(dish as object),
      rating,
      badge: unavailable ? 'Unavailable Today' : null,
      locked: unavailable,
    };
  }

  async createDish(vendorId: string, data: CreateDishInput): Promise<{ id: string }> {
    const category = await prisma.foodCategory.findUnique({ where: { id: data.categoryId } });
    if (!category) throw AppError.notFound('Category not found');

    const dish = await prisma.dish.create({
      data: {
        vendorId,
        categoryId: data.categoryId,
        name: data.name,
        description: data.description,
        price: data.price,
        imageUrl: data.imageUrl,
        sortOrder: data.sortOrder,
      },
    });
    return { id: dish.id };
  }

  async updateDish(
    dishId: string,
    vendorId: string,
    data: UpdateDishInput,
  ): Promise<{ id: string }> {
    const dish = await prisma.dish.findUnique({ where: { id: dishId } });
    if (!dish) throw AppError.notFound('Dish not found');
    if (dish.vendorId !== vendorId) {
      throw AppError.forbidden('You can only update your own dishes');
    }

    if (data.categoryId) {
      const category = await prisma.foodCategory.findUnique({ where: { id: data.categoryId } });
      if (!category) throw AppError.notFound('Category not found');
    }

    await prisma.dish.update({ where: { id: dishId }, data });
    return { id: dishId };
  }

  async deleteDish(dishId: string): Promise<void> {
    const dish = await prisma.dish.findUnique({ where: { id: dishId } });
    if (!dish) throw AppError.notFound('Dish not found');
    await prisma.dish.delete({ where: { id: dishId } });
  }

  async updateAvailability(
    dishId: string,
    vendorId: string,
    data: UpdateAvailabilityInput,
  ): Promise<{ id: string }> {
    const dish = await prisma.dish.findUnique({ where: { id: dishId } });
    if (!dish) throw AppError.notFound('Dish not found');
    if (dish.vendorId !== vendorId) {
      throw AppError.forbidden('You can only update your own dishes');
    }

    await prisma.dish.update({
      where: { id: dishId },
      data: {
        isAvailable: data.isAvailable,
        availableFrom: data.availableFrom ? new Date(data.availableFrom) : null,
        availableTo: data.availableTo ? new Date(data.availableTo) : null,
      },
    });
    return { id: dishId };
  }

  // ---- Option groups / options (menu builder customizations) ----

  private async assertOwnDish(dishId: string, vendorId: string) {
    const dish = await prisma.dish.findUnique({ where: { id: dishId } });
    if (!dish) throw AppError.notFound('Dish not found');
    if (dish.vendorId !== vendorId) throw AppError.forbidden('You can only update your own dishes');
    return dish;
  }

  async createOptionGroup(
    dishId: string,
    vendorId: string,
    data: CreateOptionGroupInput,
  ): Promise<{ id: string }> {
    await this.assertOwnDish(dishId, vendorId);
    const group = await prisma.dishOptionGroup.create({
      data: {
        dishId,
        name: data.name,
        type: data.type as 'SINGLE' | 'MULTI',
        isRequired: data.isRequired,
        minSelect: data.isRequired && data.minSelect === 0 ? 1 : data.minSelect,
        maxSelect: data.maxSelect ?? (data.type === 'SINGLE' ? 1 : null),
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });
    return { id: group.id };
  }

  async updateOptionGroup(
    dishId: string,
    groupId: string,
    vendorId: string,
    data: UpdateOptionGroupInput,
  ): Promise<{ id: string }> {
    await this.assertOwnDish(dishId, vendorId);
    const group = await prisma.dishOptionGroup.findUnique({ where: { id: groupId } });
    if (!group || group.dishId !== dishId) throw AppError.notFound('Option group not found');
    await prisma.dishOptionGroup.update({
      where: { id: groupId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type as 'SINGLE' | 'MULTI' } : {}),
        ...(data.isRequired !== undefined ? { isRequired: data.isRequired } : {}),
        ...(data.minSelect !== undefined ? { minSelect: data.minSelect } : {}),
        ...(data.maxSelect !== undefined ? { maxSelect: data.maxSelect } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    return { id: groupId };
  }

  async deleteOptionGroup(dishId: string, groupId: string, vendorId: string): Promise<void> {
    await this.assertOwnDish(dishId, vendorId);
    const group = await prisma.dishOptionGroup.findUnique({ where: { id: groupId } });
    if (!group || group.dishId !== dishId) throw AppError.notFound('Option group not found');
    await prisma.dishOptionGroup.delete({ where: { id: groupId } });
  }

  async createOption(
    dishId: string,
    groupId: string,
    vendorId: string,
    data: CreateOptionInput,
  ): Promise<{ id: string }> {
    await this.assertOwnDish(dishId, vendorId);
    const group = await prisma.dishOptionGroup.findUnique({ where: { id: groupId } });
    if (!group || group.dishId !== dishId) throw AppError.notFound('Option group not found');
    const option = await prisma.dishOption.create({
      data: {
        groupId,
        label: data.label,
        priceDelta: data.priceDelta,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });
    return { id: option.id };
  }

  async updateOption(
    dishId: string,
    groupId: string,
    optionId: string,
    vendorId: string,
    data: UpdateOptionInput,
  ): Promise<{ id: string }> {
    await this.assertOwnDish(dishId, vendorId);
    const option = await prisma.dishOption.findUnique({ where: { id: optionId } });
    if (!option || option.groupId !== groupId) throw AppError.notFound('Option not found');
    await prisma.dishOption.update({ where: { id: optionId }, data });
    return { id: optionId };
  }

  async deleteOption(
    dishId: string,
    groupId: string,
    optionId: string,
    vendorId: string,
  ): Promise<void> {
    await this.assertOwnDish(dishId, vendorId);
    const option = await prisma.dishOption.findUnique({ where: { id: optionId } });
    if (!option || option.groupId !== groupId) throw AppError.notFound('Option not found');
    await prisma.dishOption.delete({ where: { id: optionId } });
  }

  private isUniqueViolation(err: unknown): boolean {
    return err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002';
  }
}

export const foodService = new FoodService();
