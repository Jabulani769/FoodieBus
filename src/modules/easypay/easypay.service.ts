import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { busService } from '../bus/bus.service.js';
import { deliveryService } from '../delivery/delivery.service.js';
import { notificationService } from '../notifications/notification.service.js';

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
  async listKitchens(): Promise<unknown[]> {
    const vendors = await prisma.vendorProfile.findMany({
      where: { isActive: true },
      orderBy: { businessName: 'asc' },
    });

    const vendorIds = vendors.map((v) => v.id);
    const ratings = await prisma.rating.groupBy({
      by: ['entityId'],
      where: { entityType: 'VENDOR', entityId: { in: vendorIds } },
      _avg: { score: true },
    });
    const ratingMap = new Map(
      ratings.map((r) => [r.entityId, r._avg.score ? Number(r._avg.score.toFixed(1)) : null]),
    );

    return vendors.map((v) => ({
      id: v.id,
      name: v.businessName,
      logo_url: v.logoUrl,
      banner_url: v.bannerUrl ?? null,
      cuisine_type: v.cuisineType ?? null,
      rating: ratingMap.get(v.id) ?? null,
      delivery_time: v.deliveryTime ?? null,
      description: v.description,
      is_open: v.isActive,
    }));
  }

  async getKitchenMenu(vendorId: string): Promise<unknown[]> {
    const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorId } });
    if (!vendor || !vendor.isActive) throw AppError.notFound('Kitchen not found');

    const dishes = await prisma.dish.findMany({
      where: { vendorId, isAvailable: true },
      include: { category: { select: { name: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return dishes.map((d) => ({
      id: d.id,
      name: d.name,
      price: money(d.price),
      image_url: d.imageUrl,
      category: d.category?.name ?? null,
      description: d.description,
      is_available: d.isAvailable,
    }));
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
      items: { item_id: string; quantity: number }[];
      payment_method?: string;
      delivery_address?: string;
      total_price?: number;
      booking_id?: string;
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
      items: input.items.map((i) => ({ dishId: i.item_id, quantity: i.quantity })),
      note: input.delivery_address,
    })) as { id: string; status: string };

    return {
      order_id: order.id,
      status: 'preparing',
      estimated_delivery_minutes: 30,
      created_at: new Date().toISOString(),
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
