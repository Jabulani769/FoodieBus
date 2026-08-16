import { Button, Card, Table, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { formatMoney, StatusBadge } from '@foodiebus/ui';
import { http } from '../api.js';
import type { DriverPayout } from '@foodiebus/types';

const api = new Api(http);

export function DriverPayoutsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['driver-payouts'],
    queryFn: () => api.listDriverPayouts({ limit: 100 }),
  });

  const pay = useMutation({
    mutationFn: (id: string) => api.payDriverPayout(id),
    onSuccess: () => {
      message.success('Payout marked paid');
      queryClient.invalidateQueries({ queryKey: ['driver-payouts'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const columns = [
    {
      title: 'Driver',
      dataIndex: ['driver', 'user', 'fullName'],
      key: 'driver',
      render: (v: string | undefined, r: DriverPayout) => v ?? r.driverId.slice(0, 8),
    },
    { title: 'Trip', dataIndex: 'tripId', key: 'trip', render: (v: string) => v.slice(0, 8) },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v: string) => formatMoney(v) },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <StatusBadge status={v} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: DriverPayout) =>
        record.status === 'PENDING' && (
          <Button size="small" type="primary" onClick={() => pay.mutate(record.id)}>
            Mark paid
          </Button>
        ),
    },
  ];

  return (
    <>
      <Typography.Title level={3}>Driver Payouts</Typography.Title>
      <Card>
        <Table rowKey="id" columns={columns} dataSource={data?.items ?? []} loading={isLoading} />
      </Card>
    </>
  );
}
