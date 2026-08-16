export interface PlatformOverview {
  from: string;
  to: string;
  current: {
    newUsers: number;
    bookings: number;
    revenue: number;
    paidPayments: number;
    newOperators: number;
    newVendors: number;
  };
  previous: {
    newUsers: number;
    bookings: number;
    revenue: number;
    paidPayments: number;
    newOperators: number;
    newVendors: number;
  };
  changePercent: {
    newUsers: number | null;
    bookings: number | null;
    revenue: number | null;
    paidPayments: number | null;
    newOperators: number | null;
    newVendors: number | null;
  };
}

export interface GrowthItem {
  period: string;
  users: number;
  bookings: number;
  revenue: string;
}

export interface UtilizationItem {
  tripId?: string;
  route?: string;
  name?: string;
  departureTime?: string;
  capacity?: number;
  booked?: number;
  utilization: number;
  totalCapacity?: number;
  totalBooked?: number;
}

export interface BookingFunnel {
  pending: number;
  confirmed: number;
  cancelled: number;
  expired: number;
  total: number;
  conversionRate: number | null;
  cancellationRate: number | null;
  expiryRate: number | null;
}

export interface PaymentFunnel {
  pending: number;
  paid: number;
  failed: number;
  refunded: number;
  total: number;
  successRate: number | null;
  failureRate: number | null;
  refundRate: number | null;
}

export interface PassengerOverview {
  uniquePassengers: number;
  totalBookings: number;
  avgBookingsPerPassenger: number | null;
  repeatPassengerRate: number | null;
  topRoute: string | null;
}

export interface TopPassenger {
  passengerId: string;
  name: string;
  email: string;
  bookings: number;
  totalSpend: string;
}

export interface NotificationDeliveryRateItem {
  channel: string;
  sent: number;
  delivered: number;
  failed: number;
  deliveryRate: number | null;
}

export interface NotificationFailureItem {
  reason: string;
  count: number;
}

export interface RefundSummary {
  totalRequests: number;
  approved: number;
  rejected: number;
  processed: number;
  failed: number;
  approvalRate: number | null;
  refundRate: number | null;
  totalRefunded: string;
}
