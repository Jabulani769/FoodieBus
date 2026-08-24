import { Button, Card, Table, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { formatDate, StatusBadge, EmptyState, cardStyle, PageHeader } from '@foodiebus/ui';
import { http } from '../api.js';

const api = new Api(http);

type OperatorRow = {
  id: string;
  businessName: string;
  isActive?: boolean;
  createdAt?: string;
  user?: { email: string; fullName: string };
};

export function OperatorsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['operators'],
    queryFn: () => api.listOperators({ limit: 100 }),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => api.approveOperator(id),
    onSuccess: () => {
      message.success('Operator status updated');
      queryClient.invalidateQueries({ queryKey: ['operators'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const columns = [
    {
      title: 'Business name',
      dataIndex: 'businessName',
      key: 'businessName',
      width: 200,
      ellipsis: true,
    },
    { title: 'Owner', dataIndex: ['user', 'fullName'], key: 'owner', width: 160, ellipsis: true },
    { title: 'Email', dataIndex: ['user', 'email'], key: 'email', width: 240, ellipsis: true },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (v: boolean) => <StatusBadge status={v ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      title: 'Registered',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (v: string) => formatDate(v),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      render: (_: unknown, record: OperatorRow) => (
        <Button size="small" onClick={() => toggle.mutate(record.id)}>
          {record.isActive ? 'Deactivate' : 'Approve'}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Operators" subtitle="Manage transport operators" />
      <Card style={cardStyle}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={(data?.items ?? []) as OperatorRow[]}
          loading={isLoading}
          tableLayout="fixed"
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <EmptyState title="No operators yet" /> }}
        />
      </Card>
    </>
  );
}
