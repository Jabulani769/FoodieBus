import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAuditLog } from '../../shared/audit/audit.js';
import { emitFoodOrderStatus } from '../../realtime/index.js';
import { couponService } from '../coupons/coupon.service.js';
import type { FoodOrderStatus } from '../../generated/prisma/enums.js';

const STATUS_FLOW: FoodOrderStatus[] = ['PLACED', 'PREPARING', 'READY', 'DELIVERED_TO_BUS'];

export interface PlaceFoodOrderInput {
  bookingId: string;
  items: { dishId: string; quantity: number }[];
  note?: string;
  couponCode?: string;
}

export class DeliveryService {
  async placeFoodOrder(passengerId: string, data: PlaceFoodOrderInput): Promise<unknown> {
    const booking = await prisma.booking.findUnique({
      where: { id: data.bookingId },
      include: { trip: { select: { id: true, status: true, departureTime: true } } },
    });
    if (!booking) throw AppError.notFound('Booking not found');
    if (booking.passengerId !== passengerId) {
      throw AppError.forbidden('You can only order food for your own bookings');
    }
    if (booking.status !== 'CONFIRMED') {
      throw AppError.conflict(
        `Food can only be ordered on confirmed bookings (current: ${booking.status})`,
      );
    }
    if (booking.trip.status === 'CANCELLED' || booking.trip.status === 'COMPLETED') {
      throw AppError.conflict(`The trip for this booking is ${booking.trip.status.toLowerCase()}`);
    }

    const dishIds = data.items.map((i) => i.dishId);
    const dishes = await prisma.dish.findMany({ where: { id: { in: dishIds } } });
    if (dishes.length !== dishIds.length) {
      throw AppError.notFound('One or more dishes were not found');
    }
    for (const dish of dishes) {
      if (!dish.isAvailable) {
        throw AppError.conflict(`Dish "${dish.name}" is currently unavailable`);
      }
    }

    const dishMap = new Map(dishes.map((d) => [d.id, d]));
    const vendorIds = new Set(dishes.map((d) => d.vendorId));
    if (vendorIds.size > 1) {
      throw AppError.validation('All items in a food order must come from the same vendor');
    }
    const vendorId = [...vendorIds][0]!;

    let total = 0;
    for (const item of data.items) {
      const dish = dishMap.get(item.dishId)!;
      total += Number(dish.price) * item.quantity;
    }

    const order = await prisma.$transaction(async (tx) => {
      const orderId = crypto.randomUUID();
      let couponCode: string | undefined;
      let discountAmount = 0;
      let finalAmount = total;
      if (data.couponCode) {
        const coupon = await couponService.redeemCoupon(
          tx,
          data.couponCode,
          passengerId,
          { contextType: 'food_order', contextId: orderId },
          { applicableTo: 'FOOD', amount: total },
        );
        couponCode = coupon.code;
        discountAmount = coupon.discountAmount;
        finalAmount = coupon.finalAmount;
      }

      const created = await tx.foodOrder.create({
        data: {
          id: orderId,
          bookingId: booking.id,
          passengerId,
          tripId: booking.trip.id,
          vendorId,
          totalAmount: finalAmount,
          couponCode,
          discountAmount,
          note: data.note,
        },
      });
      await tx.foodOrderItem.createMany({
        data: data.items.map((item) => {
          const dish = dishMap.get(item.dishId)!;
          return {
            foodOrderId: created.id,
            dishId: item.dishId,
            quantity: item.quantity,
            unitPrice: dish.price,
          };
        }),
      });
      return created;
    });

    return this.getFoodOrderDetail(order.id, passengerId);
  }

  async listByPassenger(passengerId: string): Promise<{ items: unknown[] }> {
    const items = await prisma.foodOrder.findMany({
      where: { passengerId },
      include: this.orderInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return { items };
  }

  async getFoodOrderDetail(
    orderId: string,
    viewerId: string,
    viewerRole?: string,
  ): Promise<unknown> {
    const order = await prisma.foodOrder.findUnique({
      where: { id: orderId },
      include: this.orderInclude(),
    });
    if (!order) throw AppError.notFound('Food order not found');

    const isPassenger = order.passengerId === viewerId;
    const isVendor = viewerRole === 'VENDOR' && order.vendor.userId === viewerId;
    const isOperator =
      viewerRole === 'OPERATOR' &&
      (await prisma.trip.findFirst({
        where: { id: order.tripId, operator: { userId: viewerId } },
      })) !== null;
    if (!isPassenger && !isVendor && !isOperator) {
      throw AppError.forbidden('You can only view your own food orders');
    }
    return order;
  }

  async updateFoodOrderStatus(
    orderId: string,
    newStatus: FoodOrderStatus,
    vendorUserId: string,
  ): Promise<unknown> {
    const order = await prisma.foodOrder.findUnique({
      where: { id: orderId },
      include: { vendor: true, booking: true },
    });
    if (!order) throw AppError.notFound('Food order not found');
    if (order.vendor.userId !== vendorUserId) {
      throw AppError.forbidden('You can only update your own vendor food orders');
    }
    if (order.status === 'CANCELLED' || order.status === 'DELIVERED_TO_BUS') {
      throw AppError.conflict(`Food order is already ${order.status.toLowerCase()}`);
    }

    const currentIndex = STATUS_FLOW.indexOf(order.status);
    const nextIndex = STATUS_FLOW.indexOf(newStatus);
    if (currentIndex === -1 || nextIndex === -1) {
      throw AppError.conflict(`Invalid food order status transition`);
    }
    if (newStatus !== 'CANCELLED' && nextIndex !== currentIndex + 1) {
      throw AppError.conflict(
        `Food order status can only advance one step at a time (${order.status} → ${newStatus})`,
      );
    }

    await prisma.foodOrder.update({ where: { id: orderId }, data: { status: newStatus } });
    await writeAuditLog({
      actorId: vendorUserId,
      action: 'food_order.status',
      entity: 'food_order',
      entityId: orderId,
      details: { from: order.status, to: newStatus },
    });

    emitFoodOrderStatus(order.passengerId, {
      orderId: order.id,
      status: newStatus,
      vendorName: order.vendor.businessName,
    });

    return this.getFoodOrderDetail(orderId, vendorUserId, 'VENDOR');
  }

  async listVendorOrders(
    vendorUserId: string,
    filters: { status?: FoodOrderStatus; page?: number; limit?: number } = {},
  ): Promise<{ items: unknown[]; total: number }> {
    const vendor = await prisma.vendorProfile.findUnique({ where: { userId: vendorUserId } });
    if (!vendor) throw AppError.notFound('Vendor profile not found');

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const where = { vendorId: vendor.id, ...(filters.status ? { status: filters.status } : {}) };

    const [items, total] = await Promise.all([
      prisma.foodOrder.findMany({
        where,
        include: this.orderInclude(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.foodOrder.count({ where }),
    ]);
    return { items, total };
  }

  private orderInclude() {
    return {
      booking: {
        include: {
          trip: {
            include: {
              route: { select: { fromCity: true, toCity: true } },
              operator: { select: { businessName: true } },
            },
          },
          seat: { select: { seatNumber: true } },
        },
      },
      vendor: { select: { id: true, businessName: true, userId: true } },
      passenger: { select: { id: true, fullName: true, phone: true } },
      items: {
        include: {
          dish: { select: { id: true, name: true, imageUrl: true } },
        },
      },
    };
  }
}

export const deliveryService = new DeliveryService();
