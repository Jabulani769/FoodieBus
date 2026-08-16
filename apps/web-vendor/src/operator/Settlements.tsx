import { Card, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Api } from '@foodiebus/api-client';
import { formatMoney, StatusBadge } from '@foodiebus/ui';
import { http } from '../api.js';
import { useAuth } from '@foodiebus/auth';

const api = new Api(http);

export function OperatorSettlements() {
  const { user } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ['operator-profile'],
    queryFn: () => api.getOperatorProfile(),
    enabled: !!user,
  });
  const operatorId = profile?.id;

  const { data: settlements, isLoading } = useQuery({
    queryKey: ['operator-settlements', operatorId],
    queryFn: () => api.listSettlements({ operatorId: operatorId!, limit: 100 }),
    enabled: !!operatorId,
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
    { title: 'Net', dataIndex: 'netAmount', key: 'net', render: (v: string) => formatMoney(v) },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <StatusBadge status={v} />,
    },
  ];

  return (
    <>
      <Typography.Title level={3}>Settlements</Typography.Title>
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
