import { Button, Card, Table, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { formatDate, StatusBadge, EmptyState, cardStyle, PageHeader } from '@foodiebus/ui';
import { http } from '../api.js';
import type { ReconciliationMismatch } from '@foodiebus/types';

const api = new Api(http);

export function ReconciliationPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['reconciliation-mismatches'],
    queryFn: () => api.listMismatches({ limit: 100 }),
  });

  const resolve = useMutation({
    mutationFn: (id: string) => api.resolveMismatch(id),
    onSuccess: () => {
      message.success('Mismatch resolved');
      queryClient.invalidateQueries({ queryKey: ['reconciliation-mismatches'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const columns = [
    { title: 'TxRef', dataIndex: 'txRef', key: 'txRef' },
    {
      title: 'Expected',
      dataIndex: 'expectedStatus',
      key: 'expected',
      render: (v?: string) => v ?? '—',
    },
    { title: 'Actual', dataIndex: 'actualStatus', key: 'actual', render: (v?: string) => v ?? '—' },
    {
      title: 'Resolved',
      dataIndex: 'resolved',
      key: 'resolved',
      render: (v: boolean) => <StatusBadge status={v ? 'RESOLVED' : 'OPEN'} />,
    },
    {
      title: 'Detected',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => formatDate(v),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: ReconciliationMismatch) =>
        !record.resolved && (
          <Button size="small" type="primary" onClick={() => resolve.mutate(record.id)}>
            Mark resolved
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Reconciliation" subtitle="Reconcile payments against the ledger" />
      <Card style={cardStyle}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={isLoading}
          locale={{
            emptyText: (
              <EmptyState
                title="All payments reconciled"
                description="No payment mismatches detected."
              />
            ),
          }}
        />
      </Card>
    </>
  );
}
