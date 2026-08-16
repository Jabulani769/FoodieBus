import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Select, Space, Table, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { Api } from '@foodiebus/api-client';
import { extractError } from '@foodiebus/api-client';
import { formatMoney, formatDate, StatusBadge } from '@foodiebus/ui';
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

export function OrdersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data: profile } = useQuery({
    queryKey: ['vendor-profile'],
    queryFn: () => api.getVendorProfile(),
    enabled: !!user,
  });
  const vendorId = profile?.id;

  const { data: orders, isLoading } = useQuery({
    queryKey: ['vendor-orders', vendorId, statusFilter],
    queryFn: () =>
      api.listVendorOrders(vendorId!, {
        limit: 50,
        status: statusFilter as FoodOrderStatus | undefined,
      }),
    enabled: !!vendorId,
  });

  const advanceStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FoodOrderStatus }) =>
      api.updateFoodOrderStatus(id, status),
    onSuccess: () => {
      message.success('Order status updated');
      queryClient.invalidateQueries({ queryKey: ['vendor-orders'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  useEffect(() => {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    const socket = io(wsUrl, { auth: { token } });
    socket.on('food:order-status', () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-orders'] });
    });
    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

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
        render: (items: { dish: { name: string }; quantity: number }[]) =>
          items.map((i) => `${i.quantity}× ${i.dish.name}`).join(', '),
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
        render: (_: unknown, record: { id: string; status: FoodOrderStatus }) => {
          const next = NEXT_STATUS[record.status];
          return (
            <Space>
              {next && (
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
    [advanceStatus],
  );

  return (
    <>
      <Typography.Title level={3}>Orders</Typography.Title>
      <Card
        title={
          <Space>
            <span>Food orders</span>
            <Select
              allowClear
              placeholder="Filter by status"
              style={{ width: 180 }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={['PLACED', 'PREPARING', 'READY', 'DELIVERED_TO_BUS', 'CANCELLED'].map(
                (s) => ({ label: s, value: s }),
              )}
            />
          </Space>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={orders?.items ?? []} loading={isLoading} />
      </Card>
    </>
  );
}
