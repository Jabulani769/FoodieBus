import { Card, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Api } from '@foodiebus/api-client';
import { formatMoney, StatusBadge } from '@foodiebus/ui';
import { http } from '../api.js';
import { useAuth } from '@foodiebus/auth';

const api = new Api(http);

export function PayoutsPage() {
  const { user } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ['vendor-profile'],
    queryFn: () => api.getVendorProfile(),
    enabled: !!user,
  });

  const vendorId = profile?.id;

  const { data: settlements, isLoading } = useQuery({
    queryKey: ['vendor-settlements', vendorId],
    queryFn: () => api.listSettlements({ vendorId: vendorId!, limit: 100 }),
    enabled: !!vendorId,
  });

  const columns = [
    { title: 'Period', dataIndex: 'period', key: 'period' },
    {
      title: 'Gross',
      dataIndex: 'grossAmount',
      key: 'gross',
      render: (v: string) => formatMoney(v),
    },
    {
      title: 'Commission',
      dataIndex: 'commissionAmount',
      key: 'commission',
      render: (v: string) => formatMoney(v),
    },
    {
      title: 'Net',
      dataIndex: 'netAmount',
      key: 'net',
      render: (v: string) => formatMoney(v),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <StatusBadge status={v} />,
    },
  ];

  return (
    <>
      <Typography.Title level={3}>Payouts &amp; Settlements</Typography.Title>
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={settlements?.items ?? []}
          loading={isLoading}
        />
      </Card>
    </>
  );
}
