import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import type {
  CreateCategoryInput,
  CreateDishInput,
  UpdateAvailabilityInput,
  UpdateCategoryInput,
  UpdateDishInput,
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

  async listCategories(): Promise<{ items: unknown[] }> {
    const items = await prisma.foodCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { items };
  }

  async createCategory(data: CreateCategoryInput): Promise<{ id: string }> {
    try {
      const category = await prisma.foodCategory.create({ data });
      return { id: category.id };
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw AppError.conflict('Category name or slug already exists');
      }
      throw err;
    }
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

  async listVendors(page: number, limit: number): Promise<PaginatedResult<unknown>> {
    const where = { isActive: true };
    const [items, total] = await Promise.all([
      prisma.vendorProfile.findMany({
        where,
        include: { user: { select: { fullName: true } } },
        orderBy: { businessName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.vendorProfile.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  async getVendorById(id: string): Promise<unknown> {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id },
      include: { user: { select: { fullName: true } } },
    });
    if (!vendor || !vendor.isActive) throw AppError.notFound('Vendor not found');
    return vendor;
  }

  async getVendorByUserId(userId: string): Promise<unknown> {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { userId },
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

    await prisma.vendorProfile.update({ where: { id: vendor.id }, data });
    return { id: vendor.id };
  }

  // ---- Dishes ----

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
        include: { category: { select: { id: true, name: true, slug: true } } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.dish.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  async getDishById(id: string): Promise<unknown> {
    const dish = await prisma.dish.findUnique({
      where: { id },
      include: {
        vendor: { select: { id: true, businessName: true } },
        category: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!dish) throw AppError.notFound('Dish not found');
    return dish;
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

  private isUniqueViolation(err: unknown): boolean {
    return err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002';
  }
}

export const foodService = new FoodService();
