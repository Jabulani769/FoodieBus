import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAuditLog } from '../../shared/audit/audit.js';
import { emitFoodOrderStatus } from '../../realtime/index.js';
import { couponService } from '../coupons/coupon.service.js';
import { assertVendorAcceptingOrders } from '../../shared/vendor-status.js';
import { haversineKm } from '../../shared/geo.js';
import type { FoodOrderStatus } from '../../generated/prisma/enums.js';

const STATUS_FLOW: FoodOrderStatus[] = ['PLACED', 'PREPARING', 'READY', 'DELIVERED_TO_BUS'];

export interface SelectedOptionInput {
  groupId: string;
  optionIds: string[];
}

export interface PlaceFoodOrderInput {
  bookingId: string;
  items: { dishId: string; quantity: number; selectedOptions?: SelectedOptionInput[] }[];
  note?: string;
  couponCode?: string;
  deliveryLat?: number;
  deliveryLng?: number;
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
    const dishes = await prisma.dish.findMany({
      where: { id: { in: dishIds } },
      include: {
        optionGroups: {
          where: { isActive: true },
          include: { options: { where: { isActive: true } } },
        },
      },
    });
    if (dishes.length !== dishIds.length) {
      throw AppError.notFound('One or more dishes were not found');
    }
    for (const dish of dishes) {
      if (!dish.isAvailable) {
        throw AppError.conflict(`Dish "${dish.name}" is currently unavailable (Unavailable Today)`);
      }
    }

    const dishMap = new Map(dishes.map((d) => [d.id, d]));
    const vendorIds = new Set(dishes.map((d) => d.vendorId));
    if (vendorIds.size > 1) {
      throw AppError.validation('All items in a food order must come from the same vendor');
    }
    const vendorId = [...vendorIds][0]!;

    // Store status guard: closed/busy locks checkout (browse allowed elsewhere)
    await assertVendorAcceptingOrders(vendorId);

    // Geofence guard if delivery coords provided
    if (data.deliveryLat !== undefined && data.deliveryLng !== undefined) {
      const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorId } });
      if (vendor?.latitude != null && vendor?.longitude != null) {
        const dist = haversineKm(
          data.deliveryLat,
          data.deliveryLng,
          vendor.latitude,
          vendor.longitude,
        );
        const radius = vendor.deliveryRadiusKm ?? 5;
        if (dist > radius) {
          throw AppError.conflict(
            `Delivery location is ${dist.toFixed(1)} km away — outside the ${radius} km delivery radius`,
          );
        }
      }
    }

    // Validate customizations + compute totals: base + sum(deltas)
    let total = 0;
    const lineDetails: {
      dishId: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      selectedOptions: unknown;
    }[] = [];
    for (const item of data.items) {
      const dish = dishMap.get(item.dishId)!;
      const base = Number(dish.price);
      let deltaPerUnit = 0;
      const selected = item.selectedOptions ?? [];

      // Build group lookup
      const groupMap = new Map(dish.optionGroups.map((g) => [g.id, g]));
      // Required groups must be settled
      for (const g of dish.optionGroups) {
        if (g.isRequired) {
          const found = selected.find((s) => s.groupId === g.id);
          if (!found || found.optionIds.length === 0) {
            throw AppError.validation(`Required selection missing: ${g.name} for "${dish.name}"`);
          }
        }
      }
      for (const sel of selected) {
        const group = groupMap.get(sel.groupId);
        if (!group) throw AppError.validation(`Invalid option group for "${dish.name}"`);
        const validIds = new Set(group.options.map((o) => o.id));
        for (const oid of sel.optionIds) {
          if (!validIds.has(oid)) {
            throw AppError.validation(`Invalid option selected for "${dish.name}" (${group.name})`);
          }
        }
        if (group.type === 'SINGLE' && sel.optionIds.length !== 1) {
          throw AppError.validation(`"${group.name}" requires exactly one choice (radio)`);
        }
        const min = group.minSelect ?? 0;
        const max = group.maxSelect ?? (group.type === 'SINGLE' ? 1 : 99);
        if (sel.optionIds.length < min) {
          throw AppError.validation(`"${group.name}" needs at least ${min} choice(s)`);
        }
        if (sel.optionIds.length > max) {
          throw AppError.validation(`"${group.name}" allows at most ${max} choice(s)`);
        }
        for (const oid of sel.optionIds) {
          const opt = group.options.find((o) => o.id === oid)!;
          deltaPerUnit += Number(opt.priceDelta);
        }
      }

      const unitTotal = base + deltaPerUnit;
      const lineTotal = unitTotal * item.quantity;
      total += lineTotal;
      lineDetails.push({
        dishId: item.dishId,
        quantity: item.quantity,
        unitPrice: unitTotal,
        lineTotal,
        selectedOptions: selected,
      });
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
        data: lineDetails.map((l) => ({
          foodOrderId: created.id,
          dishId: l.dishId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          selectedOptions: l.selectedOptions as object,
        })),
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
    return { items: items.map((o) => this.toTracker(o)) };
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
    return this.toTracker(order);
  }

  /** Live tracker shape: Pending/Accepted/Ready copy without refresh. */
  private toTracker(
    order: Record<string, unknown> & {
      status: string;
      prepMinutes?: number | null;
      estimatedReadyAt?: Date | null;
    },
  ) {
    const copy: Record<string, string> = {
      PLACED: 'Waiting for restaurant confirmation...',
      PREPARING: 'Kitchen is preparing your order',
      READY: 'Your food is ready! Driver is on the way.',
      DELIVERED_TO_BUS: 'Delivered to bus. Enjoy!',
      CANCELLED: 'Order was cancelled',
    };
    return { ...order, trackerMessage: copy[order.status] ?? order.status };
  }

  async updateFoodOrderStatus(
    orderId: string,
    newStatus: FoodOrderStatus,
    vendorUserId: string,
    prepMinutes?: number,
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

    const now = new Date();
    const patch: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'PREPARING') {
      patch.acceptedAt = now;
      if (prepMinutes) {
        patch.prepMinutes = prepMinutes;
        patch.estimatedReadyAt = new Date(now.getTime() + prepMinutes * 60_000);
      }
    }
    if (newStatus === 'READY') {
      patch.readyAt = now;
      // Vendor may set/refresh window when marking ready
      if (prepMinutes) patch.prepMinutes = prepMinutes;
    }

    await prisma.foodOrder.update({ where: { id: orderId }, data: patch });
    await writeAuditLog({
      actorId: vendorUserId,
      action: 'food_order.status',
      entity: 'food_order',
      entityId: orderId,
      details: { from: order.status, to: newStatus, prepMinutes },
    });

    const updated = await prisma.foodOrder.findUnique({ where: { id: orderId } });
    emitFoodOrderStatus(order.passengerId, {
      orderId: order.id,
      status: newStatus,
      vendorName: order.vendor.businessName,
      prepMinutes: (updated?.prepMinutes as number | undefined) ?? prepMinutes,
      estimatedReadyAt:
        (updated?.estimatedReadyAt as Date | undefined)?.toISOString?.() ?? undefined,
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
