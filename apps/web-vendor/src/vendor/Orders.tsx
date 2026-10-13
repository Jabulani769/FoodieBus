import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { Api } from '@foodiebus/api-client';
import { extractError } from '@foodiebus/api-client';
import {
  formatMoney,
  formatDate,
  StatusBadge,
  EmptyState,
  cardStyle,
  PageHeader,
} from '@foodiebus/ui';
import { http, wsUrl } from '../api.js';
import { useAuth } from '@foodiebus/auth';
import { tokenStore } from '@foodiebus/auth';
import type { FoodOrderStatus } from '@foodiebus/types';

const api = new Api(http);

const NEXT_STATUS: Record<string, FoodOrderStatus | null> = {
  PLACED: 'PREPARING',
  PREPARING: 'READY',
  READY: 'DELIVERED_TO_BUS',
  DELIVERED_TO_BUS: null,
  CANCELLED: null,
};

function beep(times = 3) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    times = Math.min(times, 5);
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      const t = ctx.currentTime + i * 0.35;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.32);
    }
    setTimeout(() => void ctx.close(), times * 400 + 200);
  } catch {
    // audio unavailable — KDS still works visually
  }
}

type OrderItem = {
  quantity: number;
  unitPrice?: string;
  lineTotal?: string | null;
  selectedOptions?: { groupId: string; optionIds: string[] }[] | null;
  dish: { name: string };
};

type OrderRow = {
  id: string;
  status: FoodOrderStatus;
  totalAmount: string;
  prepMinutes?: number | null;
  estimatedReadyAt?: string | null;
  createdAt: string;
  passenger: { fullName: string };
  booking: { trip: { route: { fromCity: string; toCity: string } } };
  items: OrderItem[];
};

function formatItems(items: OrderItem[]): string {
  return items
    .map((i) => {
      const custom =
        i.selectedOptions && i.selectedOptions.length > 0 ? ' +custom' : '';
      return `${i.quantity}× ${i.dish.name}${custom}`;
    })
    .join(', ');
}

export function OrdersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [kdsMode, setKdsMode] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [prepMinutes, setPrepMinutes] = useState(15);
  const seenIds = useRef<Set<string>>(new Set());

  const { data: profile } = useQuery({
    queryKey: ['vendor-profile'],
    queryFn: () => api.getVendorProfile(),
    enabled: !!user,
  });
  const vendorId = profile?.id;

  const effectiveFilter = kdsMode && !statusFilter ? 'PLACED' : statusFilter;

  const { data: orders, isLoading } = useQuery({
    queryKey: ['vendor-orders', vendorId, effectiveFilter],
    queryFn: () =>
      api.listVendorOrders(vendorId!, {
        limit: 50,
        status: effectiveFilter as FoodOrderStatus | undefined,
      }),
    enabled: !!vendorId,
  });

  const advanceStatus = useMutation({
    mutationFn: ({ id, status, prep }: { id: string; status: FoodOrderStatus; prep?: number }) =>
      api.updateFoodOrderStatus(id, status, prep),
    onSuccess: () => {
      message.success('Order status updated');
      queryClient.invalidateQueries({ queryKey: ['vendor-orders'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  useEffect(() => {
    if (orders?.items) {
      for (const o of orders.items as OrderRow[]) {
        if (!seenIds.current.has(o.id)) seenIds.current.add(o.id);
      }
    }
  }, [orders]);

  useEffect(() => {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    const socket = io(wsUrl, { auth: { token } });
    socket.on('food:order-status', (payload: { orderId: string; status: string }) => {
      queryClient.invalidateQueries({ queryKey: ['vendor-orders'] });
      // Loud KDS alert on new incoming tickets
      if (payload?.status === 'PLACED' && soundOn && !seenIds.current.has(payload.orderId)) {
        beep(3);
        message.info(`New order ${payload.orderId.slice(0, 8)} — kitchen alert`);
      }
      if (payload?.orderId) seenIds.current.add(payload.orderId);
    });
    return () => {
      socket.disconnect();
    };
  }, [queryClient, soundOn]);

  const columns = useMemo(
    () => [
      {
        title: 'Order',
        dataIndex: 'id',
        key: 'id',
        ellipsis: true,
        render: (v: string) => <Typography.Text code>{v.slice(0, 8)}</Typography.Text>,
      },
      {
        title: 'Passenger',
        dataIndex: ['passenger', 'fullName'],
        key: 'passenger',
      },
      {
        title: 'Items',
        dataIndex: 'items',
        key: 'items',
        render: (items: OrderItem[]) => (
          <span title={JSON.stringify(items)}>
            {formatItems(items)}
            {items.some((i) => i.selectedOptions?.length) && (
              <Tag color="blue" style={{ marginLeft: 6 }}>
                custom
              </Tag>
            )}
          </span>
        ),
      },
      {
        title: 'Trip',
        dataIndex: ['booking', 'trip', 'route'],
        key: 'trip',
        render: (route: { fromCity: string; toCity: string }) =>
          `${route.fromCity} → ${route.toCity}`,
      },
      {
        title: 'Amount',
        dataIndex: 'totalAmount',
        key: 'amount',
        render: (v: string) => formatMoney(v),
      },
      {
        title: 'Prep / ETA',
        key: 'prep',
        render: (_: unknown, record: OrderRow) =>
          record.prepMinutes ? (
            <span>
              {record.prepMinutes}m
              {record.estimatedReadyAt ? ` • ${formatDate(record.estimatedReadyAt)}` : ''}
            </span>
          ) : (
            <span style={{ color: '#999' }}>—</span>
          ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (v: string) => <StatusBadge status={v} />,
      },
      {
        title: 'Placed',
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (v: string) => formatDate(v),
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_: unknown, record: OrderRow) => {
          const next = NEXT_STATUS[record.status];
          return (
            <Space>
              {next === 'PREPARING' && (
                <>
                  <Select
                    size="small"
                    value={prepMinutes}
                    onChange={setPrepMinutes}
                    options={[15, 30, 45].map((m) => ({ label: `${m} mins`, value: m }))}
                    style={{ width: 90 }}
                  />
                  <Button
                    size="small"
                    type="primary"
                    loading={advanceStatus.isPending}
                    onClick={() =>
                      advanceStatus.mutate({ id: record.id, status: next, prep: prepMinutes })
                    }
                  >
                    Accept & Start Preparing
                  </Button>
                </>
              )}
              {next === 'READY' && (
                <Button
                  size="small"
                  type="primary"
                  loading={advanceStatus.isPending}
                  onClick={() => advanceStatus.mutate({ id: record.id, status: next })}
                >
                  Mark Ready for Pickup/Delivery
                </Button>
              )}
              {next && next !== 'PREPARING' && next !== 'READY' && (
                <Button
                  size="small"
                  type="primary"
                  loading={advanceStatus.isPending}
                  onClick={() => advanceStatus.mutate({ id: record.id, status: next })}
                >
                  Mark {next}
                </Button>
              )}
              {record.status !== 'CANCELLED' && record.status !== 'DELIVERED_TO_BUS' && (
                <Button
                  size="small"
                  danger
                  onClick={() => advanceStatus.mutate({ id: record.id, status: 'CANCELLED' })}
                >
                  Cancel
                </Button>
              )}
            </Space>
          );
        },
      },
    ],
    [advanceStatus, prepMinutes],
  );

  return (
    <>
      <PageHeader title="Orders" subtitle="Live Kitchen Display — accept, prepare, mark ready" />
      <Card
        style={cardStyle}
        title={
          <Space wrap>
            <span>Food orders</span>
            <Select
              allowClear
              placeholder="Filter by status"
              style={{ width: 180 }}
              value={effectiveFilter}
              onChange={setStatusFilter}
              options={['PLACED', 'PREPARING', 'READY', 'DELIVERED_TO_BUS', 'CANCELLED'].map(
                (s) => ({ label: s, value: s }),
              )}
            />
            <span>
              KDS mode <Switch checked={kdsMode} onChange={setKdsMode} />
            </span>
            <span>
              Sound <Switch checked={soundOn} onChange={setSoundOn} />
            </span>
            <Button size="small" onClick={() => beep(2)}>
              Test sound
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={orders?.items ?? []}
          loading={isLoading}
          size={kdsMode ? 'large' : 'middle'}
          locale={{ emptyText: <EmptyState title="No orders yet" /> }}
          expandable={{
            expandedRowRender: (record: OrderRow) => (
              <div style={{ fontSize: 13 }}>
                {record.items.map((i, idx) => (
                  <div key={idx}>
                    {i.quantity}× {i.dish.name} — {formatMoney(i.unitPrice ?? record.totalAmount)}
                    {i.lineTotal ? ` (line ${formatMoney(i.lineTotal)})` : ''}
                    {i.selectedOptions && i.selectedOptions.length > 0 && (
                      <div style={{ color: '#666' }}>
                        Custom: {i.selectedOptions.map((s) => s.optionIds.join(',')).join(' | ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ),
          }}
        />
      </Card>
    </>
  );
}
