import { prisma } from '../../shared/db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';

export type GrowthGranularity = 'daily' | 'weekly' | 'monthly';

function startOfWeek(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}

function periodKey(d: Date, granularity: GrowthGranularity): string {
  if (granularity === 'daily') return d.toISOString().slice(0, 10);
  if (granularity === 'weekly') return startOfWeek(d).toISOString().slice(0, 10);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function pct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export class AnalyticsService {
  // ---- Platform overview ----

  async platformOverview(
    from: Date,
    to: Date,
  ): Promise<{
    from: string;
    to: string;
    current: Record<string, number>;
    previous: Record<string, number>;
    changePercent: Record<string, number | null>;
  }> {
    const durationMs = to.getTime() - from.getTime();
    const prevTo = from;
    const prevFrom = new Date(prevTo.getTime() - durationMs);

    const metric = async (where: Prisma.UserWhereInput): Promise<number> =>
      prisma.user.count({ where });
    const bookingCount = async (gte: Date, lte: Date): Promise<number> =>
      prisma.booking.count({ where: { createdAt: { gte, lte } } });
    const revenue = async (gte: Date, lte: Date): Promise<number> => {
      const agg = await prisma.payment.aggregate({
        where: { status: 'PAID', paidAt: { gte, lte } },
        _sum: { amount: true },
      });
      return Number(agg._sum.amount ?? 0);
    };
    const paidCount = async (gte: Date, lte: Date): Promise<number> =>
      prisma.payment.count({ where: { status: 'PAID', paidAt: { gte, lte } } });

    const [
      curNewUsers,
      prevNewUsers,
      curBookings,
      prevBookings,
      curRevenue,
      prevRevenue,
      curPaid,
      prevPaid,
      curOps,
      prevOps,
      curVendors,
      prevVendors,
    ] = await Promise.all([
      metric({ createdAt: { gte: from, lte: to } }),
      metric({ createdAt: { gte: prevFrom, lte: prevTo } }),
      bookingCount(from, to),
      bookingCount(prevFrom, prevTo),
      revenue(from, to),
      revenue(prevFrom, prevTo),
      paidCount(from, to),
      paidCount(prevFrom, prevTo),
      prisma.operatorProfile.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.operatorProfile.count({ where: { createdAt: { gte: prevFrom, lte: prevTo } } }),
      prisma.vendorProfile.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.vendorProfile.count({ where: { createdAt: { gte: prevFrom, lte: prevTo } } }),
    ]);

    const current: Record<string, number> = {
      newUsers: curNewUsers,
      bookings: curBookings,
      revenue: curRevenue,
      paidPayments: curPaid,
      newOperators: curOps,
      newVendors: curVendors,
    };
    const previous: Record<string, number> = {
      newUsers: prevNewUsers,
      bookings: prevBookings,
      revenue: prevRevenue,
      paidPayments: prevPaid,
      newOperators: prevOps,
      newVendors: prevVendors,
    };
    const changePercent: Record<string, number | null> = Object.fromEntries(
      Object.keys(current).map((k) => [k, pct(current[k] ?? 0, previous[k] ?? 0)]),
    );

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      current,
      previous,
      changePercent,
    };
  }

  async platformGrowth(
    from: Date,
    to: Date,
    granularity: GrowthGranularity,
  ): Promise<{
    granularity: string;
    items: { period: string; users: number; bookings: number; revenue: string }[];
  }> {
    const [users, bookings, payments] = await Promise.all([
      prisma.user.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
      prisma.booking.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
      prisma.payment.findMany({
        where: { status: 'PAID', paidAt: { gte: from, lte: to } },
        select: { paidAt: true, amount: true },
      }),
    ]);

    const buckets = new Map<string, { users: number; bookings: number; revenue: number }>();
    for (const u of users) {
      const key = periodKey(u.createdAt, granularity);
      const b = buckets.get(key) ?? { users: 0, bookings: 0, revenue: 0 };
      b.users += 1;
      buckets.set(key, b);
    }
    for (const b of bookings) {
      const key = periodKey(b.createdAt, granularity);
      const bucket = buckets.get(key) ?? { users: 0, bookings: 0, revenue: 0 };
      bucket.bookings += 1;
      buckets.set(key, bucket);
    }
    for (const p of payments) {
      if (!p.paidAt) continue;
      const key = periodKey(p.paidAt, granularity);
      const bucket = buckets.get(key) ?? { users: 0, bookings: 0, revenue: 0 };
      bucket.revenue += Number(p.amount);
      buckets.set(key, bucket);
    }

    const items = [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, { users, bookings, revenue }]) => ({
        period,
        users,
        bookings,
        revenue: revenue.toFixed(2),
      }));

    return { granularity, items };
  }

  // ---- Seat utilization ----

  private async tripSeatSnapshot(where: Prisma.TripWhereInput) {
    return prisma.trip.findMany({
      where,
      select: {
        id: true,
        departureTime: true,
        bus: { select: { capacity: true, busType: true } },
        route: { select: { fromCity: true, toCity: true } },
        operator: { select: { businessName: true } },
        seats: { select: { status: true } },
      },
      orderBy: { departureTime: 'desc' },
    });
  }

  async tripUtilization(
    from: Date,
    to: Date,
    filters: { routeId?: string; operatorId?: string } = {},
  ): Promise<{
    items: {
      tripId: string;
      route: string;
      departureTime: string;
      capacity: number;
      booked: number;
      utilization: number;
    }[];
  }> {
    const where: Prisma.TripWhereInput = { departureTime: { gte: from, lte: to } };
    if (filters.routeId) where.routeId = filters.routeId;
    if (filters.operatorId) where.operatorId = filters.operatorId;

    const trips = await this.tripSeatSnapshot(where);
    const items = trips
      .map((t) => {
        const capacity = t.bus.capacity;
        const booked = t.seats.filter((s) => s.status === 'BOOKED').length;
        return {
          tripId: t.id,
          route: `${t.route.fromCity} → ${t.route.toCity}`,
          departureTime: t.departureTime.toISOString(),
          capacity,
          booked,
          utilization: capacity > 0 ? Number(((booked / capacity) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.utilization - a.utilization);

    return { items };
  }

  async utilizationByDimension(
    from: Date,
    to: Date,
    dimension: 'route' | 'operator',
  ): Promise<{
    items: {
      name: string;
      totalCapacity: number;
      totalBooked: number;
      utilization: number;
    }[];
  }> {
    const trips = await this.tripSeatSnapshot({ departureTime: { gte: from, lte: to } });
    const grouped = new Map<string, { capacity: number; booked: number }>();

    for (const t of trips) {
      const key =
        dimension === 'route' ? `${t.route.fromCity} → ${t.route.toCity}` : t.operator.businessName;
      const entry = grouped.get(key) ?? { capacity: 0, booked: 0 };
      entry.capacity += t.bus.capacity;
      entry.booked += t.seats.filter((s) => s.status === 'BOOKED').length;
      grouped.set(key, entry);
    }

    const items = [...grouped.entries()]
      .map(([name, { capacity, booked }]) => ({
        name,
        totalCapacity: capacity,
        totalBooked: booked,
        utilization: capacity > 0 ? Number(((booked / capacity) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.utilization - a.utilization);

    return { items };
  }

  // ---- Conversion funnels ----

  async bookingFunnel(
    from: Date,
    to: Date,
  ): Promise<{
    pending: number;
    confirmed: number;
    cancelled: number;
    expired: number;
    total: number;
    conversionRate: number | null;
    cancellationRate: number | null;
    expiryRate: number | null;
  }> {
    const rows = await prisma.booking.groupBy({
      by: ['status'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    });
    const counts: Record<string, number> = Object.fromEntries(
      rows.map((r) => [r.status, r._count._all]),
    );
    const pending = counts['PENDING'] ?? 0;
    const confirmed = counts['CONFIRMED'] ?? 0;
    const cancelled = counts['CANCELLED'] ?? 0;
    const expired = counts['EXPIRED'] ?? 0;
    const total = pending + confirmed + cancelled + expired;

    const rate = (n: number) => (total > 0 ? Number(((n / total) * 100).toFixed(1)) : null);

    return {
      pending,
      confirmed,
      cancelled,
      expired,
      total,
      conversionRate: rate(confirmed),
      cancellationRate: rate(cancelled),
      expiryRate: rate(expired),
    };
  }

  async paymentFunnel(
    from: Date,
    to: Date,
  ): Promise<{
    pending: number;
    paid: number;
    failed: number;
    refunded: number;
    total: number;
    successRate: number | null;
    failureRate: number | null;
    refundRate: number | null;
  }> {
    const rows = await prisma.payment.groupBy({
      by: ['status'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    });
    const counts: Record<string, number> = Object.fromEntries(
      rows.map((r) => [r.status, r._count._all]),
    );
    const pending = counts['PENDING'] ?? 0;
    const paid = counts['PAID'] ?? 0;
    const failed = counts['FAILED'] ?? 0;
    const refunded = counts['REFUNDED'] ?? 0;
    const total = pending + paid + failed + refunded;

    const rate = (n: number) => (total > 0 ? Number(((n / total) * 100).toFixed(1)) : null);

    return {
      pending,
      paid,
      failed,
      refunded,
      total,
      successRate: rate(paid),
      failureRate: rate(failed),
      refundRate: rate(refunded),
    };
  }

  // ---- Passenger analytics ----

  async passengerOverview(
    from: Date,
    to: Date,
  ): Promise<{
    uniquePassengers: number;
    totalBookings: number;
    avgBookingsPerPassenger: number | null;
    repeatPassengerRate: number | null;
    topRoute: string | null;
  }> {
    const bookings = await prisma.booking.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: {
        passengerId: true,
        trip: { select: { route: { select: { fromCity: true, toCity: true } } } },
      },
    });

    const perPassenger = new Map<string, number>();
    const perRoute = new Map<string, number>();
    for (const b of bookings) {
      perPassenger.set(b.passengerId, (perPassenger.get(b.passengerId) ?? 0) + 1);
      const route = `${b.trip.route.fromCity} → ${b.trip.route.toCity}`;
      perRoute.set(route, (perRoute.get(route) ?? 0) + 1);
    }

    const uniquePassengers = perPassenger.size;
    const totalBookings = bookings.length;
    const repeat = [...perPassenger.values()].filter((n) => n > 1).length;
    const topRoute = [...perRoute.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      uniquePassengers,
      totalBookings,
      avgBookingsPerPassenger:
        uniquePassengers > 0 ? Number((totalBookings / uniquePassengers).toFixed(2)) : null,
      repeatPassengerRate:
        uniquePassengers > 0 ? Number(((repeat / uniquePassengers) * 100).toFixed(1)) : null,
      topRoute,
    };
  }

  async topPassengers(
    from: Date,
    to: Date,
    sortBy: 'bookings' | 'spend',
    limit: number,
  ): Promise<{
    items: {
      passengerId: string;
      name: string;
      email: string;
      bookings: number;
      totalSpend: string;
    }[];
  }> {
    const groups = await prisma.booking.groupBy({
      by: ['passengerId'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });
    groups.sort((a, b) =>
      sortBy === 'spend'
        ? Number(b._sum.totalAmount ?? 0) - Number(a._sum.totalAmount ?? 0)
        : b._count._all - a._count._all,
    );
    const top = groups.slice(0, limit);

    const passengerIds = top.map((g) => g.passengerId);
    const users = await prisma.user.findMany({
      where: { id: { in: passengerIds } },
      select: { id: true, fullName: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const items = top.map((g) => {
      const user = userMap.get(g.passengerId);
      return {
        passengerId: g.passengerId,
        name: user?.fullName ?? 'Unknown',
        email: user?.email ?? '',
        bookings: g._count._all,
        totalSpend: (g._sum.totalAmount ?? 0).toString(),
      };
    });

    return { items };
  }

  // ---- Notification analytics ----

  async notificationDeliveryRate(
    from: Date,
    to: Date,
  ): Promise<{
    items: {
      channel: string;
      sent: number;
      delivered: number;
      failed: number;
      deliveryRate: number | null;
    }[];
  }> {
    const rows = await prisma.notification.groupBy({
      by: ['channel', 'status'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    });

    const byChannel = new Map<string, { sent: number; delivered: number; failed: number }>();
    for (const r of rows) {
      const entry = byChannel.get(r.channel) ?? { sent: 0, delivered: 0, failed: 0 };
      entry.sent += r._count._all;
      if (r.status === 'DELIVERED' || r.status === 'READ') entry.delivered += r._count._all;
      if (r.status === 'FAILED') entry.failed += r._count._all;
      byChannel.set(r.channel, entry);
    }

    const items = [...byChannel.entries()].map(([channel, { sent, delivered, failed }]) => ({
      channel,
      sent,
      delivered,
      failed,
      deliveryRate: sent > 0 ? Number(((delivered / sent) * 100).toFixed(1)) : null,
    }));

    return { items };
  }

  async notificationFailures(
    from: Date,
    to: Date,
  ): Promise<{ items: { reason: string; count: number }[] }> {
    const failures = await prisma.notification.findMany({
      where: { status: 'FAILED', createdAt: { gte: from, lte: to } },
      select: { failureReason: true },
    });

    const grouped = new Map<string, number>();
    for (const f of failures) {
      const reason = f.failureReason ?? 'unknown';
      grouped.set(reason, (grouped.get(reason) ?? 0) + 1);
    }

    const items = [...grouped.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    return { items };
  }

  // ---- Refund analytics ----

  async refundSummary(
    from: Date,
    to: Date,
  ): Promise<{
    totalRequests: number;
    approved: number;
    rejected: number;
    processed: number;
    failed: number;
    approvalRate: number | null;
    refundRate: number | null;
    totalRefunded: string;
  }> {
    const rows = await prisma.refund.groupBy({
      by: ['status'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { amount: true },
    });
    const byStatus: Record<string, { count: number; amount: number }> = {};
    for (const r of rows) {
      byStatus[r.status] = {
        count: r._count._all,
        amount: Number(r._sum.amount ?? 0),
      };
    }

    const approved = byStatus['APPROVED']?.count ?? 0;
    const processed = byStatus['PROCESSED']?.count ?? 0;
    const requested = byStatus['REQUESTED']?.count ?? 0;
    const totalRequests = Object.values(byStatus).reduce((s, v) => s + v.count, 0);

    const revenue = await prisma.payment.aggregate({
      where: { status: 'PAID', paidAt: { gte: from, lte: to } },
      _sum: { amount: true },
    });
    const totalRevenue = Number(revenue._sum.amount ?? 0);
    const totalRefunded = processed > 0 ? (byStatus['PROCESSED']?.amount ?? 0) : 0;

    return {
      totalRequests,
      approved,
      rejected: byStatus['REJECTED']?.count ?? 0,
      processed,
      failed: byStatus['FAILED']?.count ?? 0,
      approvalRate:
        requested + approved > 0
          ? Number((((requested + approved) / totalRequests) * 100).toFixed(1))
          : null,
      refundRate:
        totalRevenue > 0 ? Number(((totalRefunded / totalRevenue) * 100).toFixed(1)) : null,
      totalRefunded: totalRefunded.toFixed(2),
    };
  }
}

export const analyticsService = new AnalyticsService();
