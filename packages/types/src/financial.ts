export type RefundStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'PROCESSED' | 'FAILED';

export interface Refund {
  id: string;
  status: RefundStatus;
  amount: string;
  reason?: string;
  createdAt: string;
  payment: { id: string; txRef: string; amount: string; status: string };
}

export type SettlementStatus = 'PENDING' | 'PAID';

export interface Settlement {
  id: string;
  period: string;
  grossAmount: string;
  commissionAmount: string;
  netAmount: string;
  status: SettlementStatus;
  operatorId?: string;
  vendorId?: string;
  operator?: { businessName: string };
  vendor?: { businessName: string };
}

export type DriverPayoutStatus = 'PENDING' | 'PAID';

export interface DriverPayout {
  id: string;
  amount: string;
  status: DriverPayoutStatus;
  tripId: string;
  driverId: string;
  driver?: { user: { fullName: string } };
}

export interface ReconciliationMismatch {
  id: string;
  txRef: string;
  expectedStatus?: string;
  actualStatus?: string;
  resolved: boolean;
  createdAt: string;
}
