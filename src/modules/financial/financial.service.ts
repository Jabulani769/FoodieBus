import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAuditLog } from '../../shared/audit/audit.js';
import { paychangu } from '../payments/paychangu.js';
import { busService } from '../bus/bus.service.js';
import { notificationService } from '../notifications/notification.service.js';
import { env } from '../../shared/config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  DriverPayoutStatus,
  RefundStatus,
  SettlementStatus,
} from '../../generated/prisma/enums.js';

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

const COMMISSION_SETTING_KEY = 'commission_rate';

function csvEscape(value: unknown): string {
  let str = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export class FinancialService {
  // ---- Refund lifecycle ----

  async requestRefund(
    paymentId: string,
    amount: number,
    reason: string,
    requestedById: string,
    actorRole: string,
  ): Promise<unknown> {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { refunds: true },
    });
    if (!payment) throw AppError.notFound('Payment not found');
    if (payment.status !== 'PAID') {
      throw AppError.conflict(
        `Refunds can only be issued on paid payments (current: ${payment.status})`,
      );
    }

    const refundedAmount = payment.refunds
      .filter((r) => r.status === 'PROCESSED')
      .reduce((sum, r) => sum + Number(r.amount), 0);
    if (refundedAmount >= Number(payment.amount)) {
      throw AppError.conflict('This payment has already been fully refunded');
    }

    const pendingRefund = payment.refunds.some(
      (r) => r.status === 'REQUESTED' || r.status === 'APPROVED',
    );
    if (pendingRefund)
      throw AppError.conflict('A refund request is already pending for this payment');

    const refundable = Number(payment.amount) - refundedAmount;
    if (amount > refundable) {
      throw AppError.conflict(
        `Refund amount ${amount} exceeds the refundable balance of ${refundable}`,
      );
    }

    let refund;
    try {
      refund = await prisma.refund.create({
        data: { paymentId, amount, reason, requestedById },
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw AppError.conflict('A refund request is already pending for this payment');
      }
      throw err;
    }

    await writeAuditLog({
      actorId: requestedById,
      action: 'financial.refund_request',
      entity: 'refund',
      entityId: refund.id,
      details: { paymentId, amount, reason, role: actorRole },
    });

    return this.getRefundDetail(refund.id);
  }

  async listRefunds(
    page: number,
    limit: number,
    filters: { status?: RefundStatus; from?: Date; to?: Date } = {},
  ): Promise<PaginatedResult<unknown>> {
    const where: {
      status?: RefundStatus;
      createdAt?: { gte?: Date; lte?: Date };
    } = {};
    if (filters.status) where.status = filters.status;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from;
      if (filters.to) where.createdAt.lte = filters.to;
    }

    const [items, total] = await Promise.all([
      prisma.refund.findMany({
        where,
        include: this.refundInclude(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.refund.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  async getRefundDetail(refundId: string): Promise<unknown> {
    const refund = await prisma.refund.findUnique({
      where: { id: refundId },
      include: this.refundInclude(),
    });
    if (!refund) throw AppError.notFound('Refund not found');
    return refund;
  }

  async approveRefund(refundId: string, approvedById: string, actorRole: string): Promise<unknown> {
    const refund = await prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw AppError.notFound('Refund not found');
    if (refund.status !== 'REQUESTED') {
      throw AppError.conflict(`Only requested refunds can be approved (current: ${refund.status})`);
    }

    await prisma.refund.update({
      where: { id: refundId },
      data: { status: 'APPROVED', approvedById, approvedAt: new Date() },
    });
    await writeAuditLog({
      actorId: approvedById,
      action: 'financial.refund_approve',
      entity: 'refund',
      entityId: refundId,
      details: { role: actorRole },
    });
    return this.getRefundDetail(refundId);
  }

  async rejectRefund(
    refundId: string,
    approvedById: string,
    reason: string,
    actorRole: string,
  ): Promise<unknown> {
    const refund = await prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw AppError.notFound('Refund not found');
    if (refund.status !== 'REQUESTED') {
      throw AppError.conflict(`Only requested refunds can be rejected (current: ${refund.status})`);
    }

    await prisma.refund.update({
      where: { id: refundId },
      data: { status: 'REJECTED', approvedById, approvedAt: new Date(), failureReason: reason },
    });
    await writeAuditLog({
      actorId: approvedById,
      action: 'financial.refund_reject',
      entity: 'refund',
      entityId: refundId,
      details: { reason, role: actorRole },
    });
    return this.getRefundDetail(refundId);
  }

  async processRefund(
    refundId: string,
    processedById: string,
    actorRole: string,
  ): Promise<unknown> {
    const refund = await prisma.refund.findUnique({
      where: { id: refundId },
      include: { payment: true },
    });
    if (!refund) throw AppError.notFound('Refund not found');

    // Atomically claim the APPROVED -> PROCESSED transition. Only one concurrent
    // request can win; duplicates are rejected before any money moves.
    const claimed = await prisma.refund.updateMany({
      where: { id: refundId, status: 'APPROVED' },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw AppError.conflict(
        'Refund is not in a processable (APPROVED) state or is already being processed',
      );
    }

    try {
      const result = await paychangu.refund({
        txRef: refund.payment.txRef,
        amount: Number(refund.amount),
        reason: refund.reason,
      });

      await prisma.refund.update({
        where: { id: refundId },
        data: { paychanguRefundId: result.refundId },
      });

      const isFullRefund = Number(refund.amount) >= Number(refund.payment.amount);
      if (isFullRefund) {
        await prisma.payment.update({
          where: { id: refund.paymentId },
          data: { status: 'REFUNDED' },
        });
        await busService.forceCancelBooking(refund.payment.bookingId);
      }

      const booking = await prisma.booking.findUnique({
        where: { id: refund.payment.bookingId },
        select: { passengerId: true },
      });
      if (booking) {
        await notificationService.notifyUser(
          booking.passengerId,
          'Refund issued',
          `A refund of MWK ${Number(refund.amount).toFixed(2)} for booking ${refund.payment.bookingId} has been issued to your original payment method.`,
          { reference: refund.id, referenceType: 'refund' },
        );
      }

      await writeAuditLog({
        actorId: processedById,
        action: 'financial.refund_process',
        entity: 'refund',
        entityId: refundId,
        details: { paymentId: refund.paymentId, amount: Number(refund.amount), role: actorRole },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown refund error';
      await prisma.refund.update({
        where: { id: refundId },
        data: { status: 'FAILED', failureReason: message },
      });
      await writeAuditLog({
        actorId: processedById,
        action: 'financial.refund_fail',
        entity: 'refund',
        entityId: refundId,
        details: { message, role: actorRole },
      });
      throw AppError.paymentFailed(message);
    }

    return this.getRefundDetail(refundId);
  }

  // ---- Revenue reports ----

  async revenueReport(
    from: Date,
    to: Date,
  ): Promise<{
    from: string;
    to: string;
    totalRevenue: string;
    totalPayments: number;
    foodOrders: number;
    refunds: string;
    daily: { date: string; revenue: string; payments: number }[];
  }> {
    const payments = await prisma.payment.findMany({
      where: { status: 'PAID', paidAt: { gte: from, lte: to } },
      select: { amount: true, paidAt: true },
    });
    const foodOrders = await prisma.foodOrder.findMany({
      where: { status: 'DELIVERED_TO_BUS', updatedAt: { gte: from, lte: to } },
      select: { totalAmount: true, updatedAt: true },
    });
    const refunds = await prisma.refund.findMany({
      where: { status: 'PROCESSED', processedAt: { gte: from, lte: to } },
      select: { amount: true, processedAt: true },
    });

    const dailyMap = new Map<string, { revenue: number; payments: number }>();
    for (const p of payments) {
      const day = p.paidAt!.toISOString().slice(0, 10);
      const entry = dailyMap.get(day) ?? { revenue: 0, payments: 0 };
      entry.revenue += Number(p.amount);
      entry.payments += 1;
      dailyMap.set(day, entry);
    }
    for (const o of foodOrders) {
      const day = o.updatedAt!.toISOString().slice(0, 10);
      const entry = dailyMap.get(day) ?? { revenue: 0, payments: 0 };
      entry.revenue += Number(o.totalAmount);
      dailyMap.set(day, entry);
    }
    const daily = [...dailyMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, { revenue, payments }]) => ({
        date,
        revenue: revenue.toFixed(2),
        payments,
      }));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalRevenue: (
        payments.reduce((sum, p) => sum + Number(p.amount), 0) +
        foodOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0)
      ).toFixed(2),
      totalPayments: payments.length,
      foodOrders: foodOrders.length,
      refunds: refunds.reduce((sum, r) => sum + Number(r.amount), 0).toFixed(2),
      daily,
    };
  }

  async revenueByRoute(
    from: Date,
    to: Date,
  ): Promise<{ items: { route: string; revenue: string; payments: number }[] }> {
    const payments = await prisma.payment.findMany({
      where: { status: 'PAID', paidAt: { gte: from, lte: to } },
      include: {
        booking: {
          include: {
            trip: { include: { route: { select: { fromCity: true, toCity: true } } } },
          },
        },
      },
    });
    const foodOrders = await prisma.foodOrder.findMany({
      where: { status: 'DELIVERED_TO_BUS', updatedAt: { gte: from, lte: to } },
      include: {
        trip: { include: { route: { select: { fromCity: true, toCity: true } } } },
      },
    });

    const routeMap = new Map<string, { revenue: number; payments: number }>();
    for (const p of payments) {
      const route = `${p.booking.trip.route.fromCity} → ${p.booking.trip.route.toCity}`;
      const entry = routeMap.get(route) ?? { revenue: 0, payments: 0 };
      entry.revenue += Number(p.amount);
      entry.payments += 1;
      routeMap.set(route, entry);
    }
    for (const o of foodOrders) {
      const route = `${o.trip.route.fromCity} → ${o.trip.route.toCity}`;
      const entry = routeMap.get(route) ?? { revenue: 0, payments: 0 };
      entry.revenue += Number(o.totalAmount);
      routeMap.set(route, entry);
    }

    return {
      items: [...routeMap.entries()]
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .map(([route, { revenue, payments }]) => ({
          route,
          revenue: revenue.toFixed(2),
          payments,
        })),
    };
  }

  async revenueByOperator(
    from: Date,
    to: Date,
  ): Promise<{ items: { operator: string; revenue: string; payments: number }[] }> {
    const payments = await prisma.payment.findMany({
      where: { status: 'PAID', paidAt: { gte: from, lte: to } },
      include: {
        booking: {
          include: {
            trip: { include: { operator: { select: { businessName: true } } } },
          },
        },
      },
    });

    const operatorMap = new Map<string, { revenue: number; payments: number }>();
    for (const p of payments) {
      const operator = p.booking.trip.operator.businessName;
      const entry = operatorMap.get(operator) ?? { revenue: 0, payments: 0 };
      entry.revenue += Number(p.amount);
      entry.payments += 1;
      operatorMap.set(operator, entry);
    }

    return {
      items: [...operatorMap.entries()]
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .map(([operator, { revenue, payments }]) => ({
          operator,
          revenue: revenue.toFixed(2),
          payments,
        })),
    };
  }

  async exportPaymentsCsv(from: Date, to: Date): Promise<string> {
    const payments = await prisma.payment.findMany({
      where: { status: 'PAID', paidAt: { gte: from, lte: to } },
      orderBy: { paidAt: 'asc' },
      include: {
        booking: {
          include: {
            trip: {
              include: {
                route: { select: { fromCity: true, toCity: true } },
                operator: { select: { businessName: true } },
              },
            },
            seat: { select: { seatNumber: true } },
            passenger: { select: { fullName: true, phone: true } },
          },
        },
      },
    });

    const header = [
      'TxRef',
      'Date',
      'Amount',
      'Charges',
      'Route',
      'Seat',
      'Passenger',
      'Phone',
      'Operator',
    ];
    const rows = payments.map((p) => [
      p.txRef,
      p.paidAt?.toISOString() ?? '',
      p.amount.toString(),
      p.charges?.toString() ?? '',
      `${p.booking.trip.route.fromCity} → ${p.booking.trip.route.toCity}`,
      p.booking.seat.seatNumber,
      p.booking.passenger.fullName,
      p.booking.passenger.phone,
      p.booking.trip.operator.businessName,
    ]);

    return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  }

  // ---- Settlements ----

  async generateSettlements(
    period: string,
    actorId: string,
    actorRole: string,
  ): Promise<{ items: unknown[] }> {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw AppError.validation('Period must be in YYYY-MM format');
    }

    const [startOfMonth, startOfNextMonth] = this.periodRange(period);

    const setting = await prisma.platformSetting.findUnique({
      where: { key: COMMISSION_SETTING_KEY },
    });
    const commissionRate = typeof setting?.value === 'number' ? setting.value : env.COMMISSION_RATE;

    const operators = await prisma.operatorProfile.findMany({ select: { id: true } });

    const created: unknown[] = [];

    for (const operator of operators) {
      const gross = await prisma.payment.aggregate({
        where: {
          status: 'PAID',
          paidAt: { gte: startOfMonth, lt: startOfNextMonth },
          booking: { trip: { operatorId: operator.id } },
        },
        _sum: { amount: true },
      });
      const grossAmount = Number(gross._sum.amount ?? 0);
      if (grossAmount <= 0) continue;

      const commissionAmt = grossAmount * commissionRate;
      const net = grossAmount - commissionAmt;
      const existing = await prisma.settlement.findUnique({
        where: { operatorId_period: { operatorId: operator.id, period } },
      });
      if (existing) continue;

      const settlement = await prisma.settlement.create({
        data: {
          operatorId: operator.id,
          period,
          grossRevenue: grossAmount,
          commissionRate,
          commissionAmt,
          netPayout: net,
        },
      });
      created.push(settlement);
    }

    const vendors = await prisma.vendorProfile.findMany({ select: { id: true } });

    for (const vendor of vendors) {
      const gross = await prisma.foodOrder.aggregate({
        where: {
          status: 'DELIVERED_TO_BUS',
          updatedAt: { gte: startOfMonth, lt: startOfNextMonth },
          vendorId: vendor.id,
        },
        _sum: { totalAmount: true },
      });
      const grossAmount = Number(gross._sum.totalAmount ?? 0);
      if (grossAmount <= 0) continue;

      const commissionAmt = grossAmount * commissionRate;
      const net = grossAmount - commissionAmt;
      const existing = await prisma.settlement.findUnique({
        where: { vendorId_period: { vendorId: vendor.id, period } },
      });
      if (existing) continue;

      const settlement = await prisma.settlement.create({
        data: {
          vendorId: vendor.id,
          period,
          grossRevenue: grossAmount,
          commissionRate,
          commissionAmt,
          netPayout: net,
        },
      });
      created.push(settlement);
    }

    if (created.length > 0) {
      await writeAuditLog({
        actorId,
        action: 'financial.settlement_generate',
        entity: 'settlement',
        details: { period, count: created.length, commissionRate, role: actorRole },
      });
    }

    return { items: created };
  }

  async listSettlements(
    page: number,
    limit: number,
    filters: {
      operatorId?: string;
      vendorId?: string;
      period?: string;
      status?: SettlementStatus;
    } = {},
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.SettlementWhereInput = {};
    if (filters.operatorId) where.operatorId = filters.operatorId;
    if (filters.vendorId) where.vendorId = filters.vendorId;
    if (filters.period) where.period = filters.period;
    if (filters.status) where.status = filters.status;

    const [items, total] = await Promise.all([
      prisma.settlement.findMany({
        where,
        include: {
          operator: { select: { id: true, businessName: true } },
          vendor: { select: { id: true, businessName: true } },
        },
        orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.settlement.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  async markSettlementPaid(
    settlementId: string,
    actorId: string,
    actorRole: string,
  ): Promise<unknown> {
    const settlement = await prisma.settlement.findUnique({ where: { id: settlementId } });
    if (!settlement) throw AppError.notFound('Settlement not found');
    if (settlement.status !== 'PENDING') {
      throw AppError.conflict(`Settlement is already ${settlement.status.toLowerCase()}`);
    }

    await prisma.settlement.update({
      where: { id: settlementId },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await writeAuditLog({
      actorId,
      action: 'financial.settlement_pay',
      entity: 'settlement',
      entityId: settlementId,
      details: { period: settlement.period, role: actorRole },
    });
    return prisma.settlement.findUnique({
      where: { id: settlementId },
      include: {
        operator: { select: { id: true, businessName: true } },
        vendor: { select: { id: true, businessName: true } },
      },
    });
  }

  // ---- Driver payouts ----

  async listDriverPayouts(
    page: number,
    limit: number,
    filters: { driverId?: string; status?: DriverPayoutStatus } = {},
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.DriverTripPayoutWhereInput = {};
    if (filters.driverId) where.driverId = filters.driverId;
    if (filters.status) where.status = filters.status;

    const [items, total] = await Promise.all([
      prisma.driverTripPayout.findMany({
        where,
        include: {
          driver: {
            include: { user: { select: { id: true, fullName: true, phone: true } } },
          },
          trip: {
            include: {
              route: { select: { fromCity: true, toCity: true } },
              operator: { select: { businessName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.driverTripPayout.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  async markDriverPayoutPaid(
    payoutId: string,
    actorId: string,
    actorRole: string,
  ): Promise<unknown> {
    const payout = await prisma.driverTripPayout.findUnique({
      where: { id: payoutId },
      include: { driver: { include: { user: true } } },
    });
    if (!payout) throw AppError.notFound('Driver payout not found');
    if (payout.status !== 'PENDING') {
      throw AppError.conflict(`Driver payout is already ${payout.status.toLowerCase()}`);
    }

    await prisma.driverTripPayout.update({
      where: { id: payoutId },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await writeAuditLog({
      actorId,
      action: 'driver_payout.pay',
      entity: 'driver_payout',
      entityId: payoutId,
      details: {
        tripId: payout.tripId,
        driverId: payout.driverId,
        amount: Number(payout.amount),
        role: actorRole,
      },
    });
    return prisma.driverTripPayout.findUnique({
      where: { id: payoutId },
      include: {
        driver: { include: { user: { select: { id: true, fullName: true, phone: true } } } },
        trip: {
          include: {
            route: { select: { fromCity: true, toCity: true } },
            operator: { select: { businessName: true } },
          },
        },
      },
    });
  }

  // ---- Reconciliation mismatches ----

  async listMismatches(
    page: number,
    limit: number,
    filters: { resolved?: 'true' | 'false' } = {},
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.ReconciliationMismatchWhereInput = {};
    if (filters.resolved) where.resolved = filters.resolved === 'true';

    const [items, total] = await Promise.all([
      prisma.reconciliationMismatch.findMany({
        where,
        include: {
          payment: {
            include: {
              booking: {
                include: {
                  trip: {
                    include: {
                      route: { select: { fromCity: true, toCity: true } },
                      operator: { select: { businessName: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.reconciliationMismatch.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  async resolveMismatch(mismatchId: string, actorId: string, actorRole: string): Promise<unknown> {
    const mismatch = await prisma.reconciliationMismatch.findUnique({
      where: { id: mismatchId },
    });
    if (!mismatch) throw AppError.notFound('Mismatch not found');
    if (mismatch.resolved) {
      throw AppError.conflict('Mismatch is already resolved');
    }

    await prisma.reconciliationMismatch.update({
      where: { id: mismatchId },
      data: { resolved: true, resolvedAt: new Date() },
    });
    await writeAuditLog({
      actorId,
      action: 'reconciliation.mismatch_resolve',
      entity: 'reconciliation_mismatch',
      entityId: mismatchId,
      details: { paymentId: mismatch.paymentId, role: actorRole },
    });
    return prisma.reconciliationMismatch.findUnique({
      where: { id: mismatchId },
      include: { payment: { include: { booking: true } } },
    });
  }

  // ---- helpers ----

  private refundInclude() {
    return {
      payment: {
        include: {
          booking: {
            include: {
              trip: {
                include: {
                  route: { select: { fromCity: true, toCity: true } },
                  operator: { select: { businessName: true } },
                },
              },
              seat: { select: { seatNumber: true } },
              passenger: { select: { fullName: true, email: true, phone: true } },
            },
          },
        },
      },
      requestedBy: { select: { id: true, fullName: true, email: true, role: true } },
      approvedBy: { select: { id: true, fullName: true, email: true, role: true } },
    };
  }

  private periodRange(period: string): [Date, Date] {
    const [yearStr, monthStr] = period.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const first = new Date(Date.UTC(year, month - 1, 1));
    const next = new Date(Date.UTC(year, month, 1));
    return [first, next];
  }

  private isUniqueViolation(err: unknown): boolean {
    return err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002';
  }
}

export const financialService = new FinancialService();
