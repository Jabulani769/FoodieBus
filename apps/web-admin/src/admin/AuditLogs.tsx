import { Card, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Api } from '@foodiebus/api-client';
import { EmptyState, formatDate, PageHeader } from '@foodiebus/ui';
import { http } from '../api.js';

const api = new Api(http);

type AuditLogRow = {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: unknown;
  createdAt: string;
  actor?: { id: string; fullName: string; email: string };
};

export function AuditLogsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => api.listAuditLogs({ limit: 100 }),
  });

  const columns = [
    {
      title: 'Actor',
      dataIndex: ['actor', 'fullName'],
      key: 'actor',
      width: 200,
      ellipsis: true,
      render: (v: string, r: AuditLogRow) => v ?? r.actor?.email ?? '—',
    },
    { title: 'Action', dataIndex: 'action', key: 'action', width: 180, ellipsis: true },
    { title: 'Entity', dataIndex: 'entity', key: 'entity', width: 140, ellipsis: true },
    {
      title: 'Entity ID',
      dataIndex: 'entityId',
      key: 'entityId',
      width: 120,
      render: (v: string | undefined) => v?.slice(0, 8) ?? '—',
    },
    {
      title: 'Time',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => formatDate(v),
    },
  ];

  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Trail of platform actions" />
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={(data?.items ?? []) as AuditLogRow[]}
          loading={isLoading}
          tableLayout="fixed"
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <EmptyState title="No audit log entries yet" /> }}
        />
      </Card>
    </>
  );
}
