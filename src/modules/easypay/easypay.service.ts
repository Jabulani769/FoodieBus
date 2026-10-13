import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { busService } from '../bus/bus.service.js';
import { deliveryService } from '../delivery/delivery.service.js';
import { notificationService } from '../notifications/notification.service.js';
import { haversineKm, estimateEtaMinutes, formatDistanceEta } from '../../shared/geo.js';
import { getVendorStatus } from '../../shared/vendor-status.js';

// Translate the "Easy Pay" mobile contract (snake_case, double money, readable
// shapes) onto FoodieBus internals. This module is the BFF/adapter the Flutter
// app talks to; FoodieBus core services stay untouched.

function money(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value.toString());
}

function formatDepartureTime(date: Date): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface EasyPayUser {
  id: string;
  role: string;
  email: string;
  phone: string;
  fullName?: string;
}

export class EasyPayService {
  async listKitchens(
    opts: { lat?: number; lng?: number; category?: string; page?: number; limit?: number } = {},
  ): Promise<unknown[]> {
    const where: Record<string, unknown> = { isActive: true };
    if (opts.category) {
      Object.assign(where, {
        dishes: {
          some: {
            category: {
              OR: [
                { slug: opts.category },
                { name: { equals: opts.category, mode: 'insensitive' } },
              ],
            },
          },
        },
      });
    }
    const vendors = await prisma.vendorProfile.findMany({
      where,
      orderBy: { businessName: 'asc' },
    });

    const vendorIds = vendors.map((v) => v.id);
    const ratings = vendorIds.length
      ? await prisma.rating.groupBy({
          by: ['entityId'],
          where: { entityType: 'VENDOR', entityId: { in: vendorIds } },
          _avg: { score: true },
        })
      : [];
    const ratingMap = new Map(
      ratings.map((r) => [r.entityId, r._avg.score ? Number(r._avg.score.toFixed(1)) : null]),
    );

    const out: unknown[] = [];
    for (const v of vendors) {
      const status = await getVendorStatus(v.id);
      let distanceKm: number | null = null;
      let distanceM: number | null = null;
      let eta: number | null = null;
      let label: string | null = null;
      if (
        opts.lat !== undefined &&
        opts.lng !== undefined &&
        v.latitude != null &&
        v.longitude != null
      ) {
        distanceKm = haversineKm(opts.lat, opts.lng, v.latitude, v.longitude);
        const radius = v.deliveryRadiusKm ?? 5;
        if (distanceKm > radius) continue; // hide out-of-radius
        distanceM = Math.round(distanceKm * 1000);
        eta = estimateEtaMinutes(distanceKm, v.deliveryTime);
        label = formatDistanceEta(distanceKm, eta);
      }
      out.push({
        id: v.id,
        name: v.businessName,
        logo_url: v.logoUrl,
        banner_url: v.bannerUrl ?? null,
        cuisine_type: v.cuisineType ?? null,
        rating: ratingMap.get(v.id) ?? null,
        delivery_time: v.deliveryTime ?? null,
        description: v.description,
        is_open: status.isOpen,
        status: status.status,
        store_label: status.label,
        is_paused: v.isPaused,
        distance_km: distanceKm,
        distance_m: distanceM,
        eta_min: eta,
        distance_label: label,
      });
    }
    if (opts.lat !== undefined) {
      out.sort(
        (a, b) =>
          ((a as { distance_km?: number | null }).distance_km ?? 9999) -
          ((b as { distance_km?: number | null }).distance_km ?? 9999),
      );
    }
    // Backwards-compatible: still returns an array. page/limit slice the
    // sorted feed; an empty array with lat/lng means everything was hidden
    // as out-of-range (compare against unfiltered call to distinguish).
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 50;
    return out.slice((page - 1) * limit, page * limit);
  }

  /** Pre-checkout vendor status without fetching the full feed. */
  async getKitchenStatus(vendorId: string): Promise<unknown> {
    const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorId } });
    if (!vendor || !vendor.isActive) throw AppError.notFound('Kitchen not found');
    const status = await getVendorStatus(vendor.id);
    return {
      id: vendor.id,
      is_open: status.isOpen,
      status: status.status,
      status_lower: status.status.toLowerCase(),
      store_label: status.label,
      is_paused: vendor.isPaused,
      delivery_radius_km: vendor.deliveryRadiusKm ?? 5,
    };
  }

  async getKitchenMenu(vendorId: string): Promise<unknown[]> {
    const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorId } });
    if (!vendor || !vendor.isActive) throw AppError.notFound('Kitchen not found');

    const dishes = await prisma.dish.findMany({
      where: { vendorId },
      include: {
        category: { select: { name: true, slug: true } },
        optionGroups: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: { options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    // Return ALL dishes (browse allowed) with badge/lock instead of hiding unavailable
    return dishes.map((d) => ({
      id: d.id,
      name: d.name,
      price: money(d.price),
      base_price: money(d.price),
      image_url: d.imageUrl,
      category: d.category?.name ?? null,
      category_slug: d.category?.slug ?? null,
      description: d.description,
      is_available: d.isAvailable,
      badge: d.isAvailable ? null : 'Unavailable Today',
      locked: !d.isAvailable,
      customizations: d.optionGroups.map((g) => ({
        group_id: g.id,
        name: g.name,
        type: g.type,
        is_required: g.isRequired,
        min_select: g.minSelect,
        max_select: g.maxSelect,
        options: g.options.map((o) => ({
          option_id: o.id,
          label: o.label,
          price_delta: money(o.priceDelta),
        })),
      })),
    }));
  }

  async getKitchenMenuGrouped(vendorId: string): Promise<unknown> {
    const items = (await this.getKitchenMenu(vendorId)) as Array<{
      category?: string | null;
      category_slug?: string | null;
    }>;
    const map = new Map<string, { header: string; slug: string | null; items: unknown[] }>();
    for (const d of items) {
      const key = d.category ?? 'Other';
      if (!map.has(key)) map.set(key, { header: key, slug: d.category_slug ?? null, items: [] });
      map.get(key)!.items.push(d);
    }
    return { groups: [...map.values()] };
  }

  async searchBus(
    from: string | undefined,
    to: string | undefined,
    date: string | undefined,
  ): Promise<unknown[]> {
    const where: Record<string, unknown> = { status: { not: 'CANCELLED' } };
    if (from) {
      where.OR = [
        { route: { fromCity: { equals: from, mode: 'insensitive' } } },
        { route: { stops: { some: { city: { equals: from, mode: 'insensitive' } } } } },
      ];
    }
    if (to) {
      where.AND = [
        {
          OR: [
            { route: { toCity: { equals: to, mode: 'insensitive' } } },
            { route: { stops: { some: { city: { equals: to, mode: 'insensitive' } } } } },
          ],
        },
      ];
    }
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(`${date}T23:59:59.999Z`);
      if (!Number.isNaN(start.getTime())) where.departureTime = { gte: start, lte: end };
    }

    const trips = await prisma.trip.findMany({
      where,
      include: { route: true, operator: true, seats: true },
      orderBy: { departureTime: 'asc' },
      take: 100,
    });

    return trips.map((t) => ({
      id: t.id,
      operator: t.operator.businessName,
      from: t.route.fromCity,
      to: t.route.toCity,
      departure_time: formatDepartureTime(t.departureTime),
      price: money(t.price),
      available_seats: t.seats.filter((s) => s.status === 'AVAILABLE').length,
      logo_url: t.operator.logoUrl,
    }));
  }

  async bookBus(
    user: EasyPayUser,
    input: {
      route_id: string;
      passenger_name?: string;
      passenger_phone?: string;
      seat_number?: string;
      payment_method?: string;
    },
  ): Promise<Record<string, unknown>> {
    const trip = await prisma.trip.findUnique({
      where: { id: input.route_id },
      include: { seats: true },
    });
    if (!trip || trip.status === 'CANCELLED') throw AppError.notFound('Trip not found');

    let seatNumber = input.seat_number;
    let seat = input.seat_number
      ? trip.seats.find((s) => s.seatNumber === input.seat_number && s.status === 'AVAILABLE')
      : undefined;
    if (!seat) {
      seat = trip.seats.find((s) => s.status === 'AVAILABLE');
      seatNumber = seat?.seatNumber;
    }
    if (!seat) throw AppError.conflict('No seats available for this trip');

    const booking = await busService.createBooking(trip.id, seatNumber!, user.id, {
      tripId: trip.id,
      seatNumber: seatNumber!,
      passengerName: input.passenger_name ?? user.fullName ?? user.phone,
      passengerPhone: input.passenger_phone ?? user.phone,
    });

    return {
      ticket_id: booking.id,
      qr_code_data: `FB-${booking.id}`,
      status: 'active',
      issued_at: new Date().toISOString(),
    };
  }

  async placeFoodOrder(
    user: EasyPayUser,
    input: {
      kitchen_id: string;
      items: {
        item_id: string;
        quantity: number;
        selected_options?: { group_id: string; option_ids: string[] }[];
      }[];
      payment_method?: string;
      delivery_address?: string;
      total_price?: number;
      booking_id?: string;
      delivery_lat?: number;
      delivery_lng?: number;
    },
  ): Promise<Record<string, unknown>> {
    const vendor = await prisma.vendorProfile.findUnique({ where: { id: input.kitchen_id } });
    if (!vendor || !vendor.isActive) throw AppError.notFound('Kitchen not found');
    if (!input.items?.length) throw AppError.validation('Order must contain at least one item');

    let bookingId = input.booking_id;
    if (!bookingId) {
      const latest = await prisma.booking.findFirst({
        where: { passengerId: user.id, status: 'CONFIRMED' },
        orderBy: { createdAt: 'desc' },
      });
      if (!latest) {
        throw AppError.validation('A confirmed bus booking is required to place a food order');
      }
      bookingId = latest.id;
    }

    const order = (await deliveryService.placeFoodOrder(user.id, {
      bookingId,
      items: input.items.map((i) => ({
        dishId: i.item_id,
        quantity: i.quantity,
        selectedOptions: i.selected_options?.map((s) => ({
          groupId: s.group_id,
          optionIds: s.option_ids,
        })),
      })),
      note: input.delivery_address,
      deliveryLat: input.delivery_lat,
      deliveryLng: input.delivery_lng,
    })) as {
      id: string;
      status: string;
      prepMinutes?: number | null;
      estimatedReadyAt?: string | null;
    };

    const statusMap: Record<string, string> = {
      PLACED: 'pending',
      PREPARING: 'preparing',
      READY: 'ready',
      DELIVERED_TO_BUS: 'delivered',
      CANCELLED: 'cancelled',
    };
    const lower = statusMap[order.status] ?? order.status.toLowerCase();
    return {
      order_id: order.id,
      status: lower,
      status_lower: lower,
      status_upper: order.status,
      estimated_delivery_minutes: order.prepMinutes ?? 30,
      estimated_ready_at: order.estimatedReadyAt ?? null,
      created_at: new Date().toISOString(),
    };
  }

  /** Cart total preview: same validation + math as placeFoodOrder, no write. */
  async previewFoodOrder(input: {
    kitchen_id: string;
    items: {
      item_id: string;
      quantity: number;
      selected_options?: { group_id: string; option_ids: string[] }[];
    }[];
  }): Promise<Record<string, unknown>> {
    const vendor = await prisma.vendorProfile.findUnique({ where: { id: input.kitchen_id } });
    if (!vendor || !vendor.isActive) throw AppError.notFound('Kitchen not found');
    if (!input.items?.length) throw AppError.validation('Order must contain at least one item');

    const dishIds = input.items.map((i) => i.item_id);
    const dishes = await prisma.dish.findMany({
      where: { id: { in: dishIds } },
      include: {
        optionGroups: {
          where: { isActive: true },
          include: { options: { where: { isActive: true } } },
        },
      },
    });
    if (dishes.length !== dishIds.length)
      throw AppError.notFound('One or more dishes were not found');
    for (const d of dishes) {
      if (d.vendorId !== vendor.id)
        throw AppError.validation('All items must come from the same kitchen');
      if (!d.isAvailable)
        throw AppError.conflict(`Dish "${d.name}" is currently unavailable (Unavailable Today)`);
    }
    const dishMap = new Map(dishes.map((d) => [d.id, d]));
    let total = 0;
    const lines = input.items.map((item) => {
      const dish = dishMap.get(item.item_id)!;
      const base = Number(dish.price);
      let delta = 0;
      const selected = item.selected_options ?? [];
      const groupMap = new Map(dish.optionGroups.map((g) => [g.id, g]));
      for (const g of dish.optionGroups) {
        if (g.isRequired && !selected.some((s) => s.group_id === g.id && s.option_ids.length > 0)) {
          throw AppError.validation(`Required selection missing: ${g.name} for "${dish.name}"`);
        }
      }
      for (const sel of selected) {
        const group = groupMap.get(sel.group_id);
        if (!group) throw AppError.validation(`Invalid option group for "${dish.name}"`);
        const valid = new Set(group.options.map((o) => o.id));
        for (const oid of sel.option_ids) {
          if (!valid.has(oid))
            throw AppError.validation(`Invalid option selected for "${dish.name}" (${group.name})`);
        }
        if (group.type === 'SINGLE' && sel.option_ids.length !== 1) {
          throw AppError.validation(`"${group.name}" requires exactly one choice (radio)`);
        }
        const min = group.minSelect ?? 0;
        const max = group.maxSelect ?? (group.type === 'SINGLE' ? 1 : 99);
        if (sel.option_ids.length < min)
          throw AppError.validation(`"${group.name}" needs at least ${min} choice(s)`);
        if (sel.option_ids.length > max)
          throw AppError.validation(`"${group.name}" allows at most ${max} choice(s)`);
        for (const oid of sel.option_ids)
          delta += Number(group.options.find((o) => o.id === oid)!.priceDelta);
      }
      const unit = base + delta;
      const line = unit * item.quantity;
      total += line;
      return { item_id: item.item_id, quantity: item.quantity, unit, line_total: line };
    });
    const status = await getVendorStatus(vendor.id);
    return {
      kitchen_id: vendor.id,
      lines,
      total,
      is_open: status.isOpen,
      status: status.status,
      store_label: status.label,
    };
  }

  async trackFoodOrder(userId: string, orderId: string): Promise<unknown> {
    const order = (await deliveryService.getFoodOrderDetail(orderId, userId, 'STUDENT')) as {
      status: string;
      prepMinutes?: number | null;
      estimatedReadyAt?: Date | string | null;
    };
    const messages: Record<string, string> = {
      PLACED: 'Waiting for restaurant confirmation...',
      PREPARING: 'Kitchen is preparing your order',
      READY: 'Your food is ready! Driver is on the way.',
      DELIVERED_TO_BUS: 'Delivered to bus. Enjoy!',
      CANCELLED: 'Order was cancelled',
    };
    return {
      order_id: orderId,
      status: order.status,
      status_upper: order.status,
      status_lower: order.status.toLowerCase(),
      tracker_message: messages[order.status] ?? order.status,
      prep_minutes: order.prepMinutes ?? null,
      estimated_ready_at: order.estimatedReadyAt ?? null,
    };
  }

  async listNotifications(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: unknown[]; total: number }> {
    const result = await notificationService.listByUser(userId, page, limit);
    return {
      items: (result.items as Array<Record<string, unknown>>).map((n) => ({
        id: n.id,
        title: n.subject ?? 'Notification',
        body: n.body,
        type: String(n.channel ?? 'system').toLowerCase(),
        is_read: n.status === 'READ',
        created_at: n.createdAt,
      })),
      total: result.total,
    };
  }
}

export const easyPayService = new EasyPayService();
