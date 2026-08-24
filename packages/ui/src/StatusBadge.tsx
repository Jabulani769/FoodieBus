import { Tag } from 'antd';

const STATUS_COLORS: Record<string, string> = {
  // Booking
  PENDING: 'orange',
  CONFIRMED: 'green',
  CANCELLED: 'red',
  EXPIRED: 'default',
  // Payment
  PAID: 'green',
  FAILED: 'red',
  REFUNDED: 'purple',
  // Trip
  SCHEDULED: 'blue',
  BOARDING: 'cyan',
  IN_TRANSIT: 'geekblue',
  COMPLETED: 'green',
  // Food order
  PLACED: 'blue',
  PREPARING: 'orange',
  READY: 'cyan',
  DELIVERED_TO_BUS: 'green',
  // Refund
  REQUESTED: 'orange',
  APPROVED: 'cyan',
  REJECTED: 'red',
  PROCESSED: 'green',
  // Settlement / payout
  SETTLED: 'green',
  // Generic
  ACTIVE: 'green',
  INACTIVE: 'default',
  RESOLVED: 'green',
  OPEN: 'orange',
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'default';
  return <Tag color={color}>{status}</Tag>;
}
