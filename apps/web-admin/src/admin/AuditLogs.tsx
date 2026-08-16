import { Card, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Api } from '@foodiebus/api-client';
import { formatDate } from '@foodiebus/ui';
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
      render: (v: string, r: AuditLogRow) => v ?? r.actor?.email ?? '—',
    },
    { title: 'Action', dataIndex: 'action', key: 'action' },
    { title: 'Entity', dataIndex: 'entity', key: 'entity' },
    {
      title: 'Entity ID',
      dataIndex: 'entityId',
      key: 'entityId',
      render: (v: string | undefined) => v?.slice(0, 8) ?? '—',
    },
    {
      title: 'Time',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => formatDate(v),
    },
  ];

  return (
    <>
      <Typography.Title level={3}>Audit Logs</Typography.Title>
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={(data?.items ?? []) as AuditLogRow[]}
          loading={isLoading}
        />
      </Card>
    </>
  );
}
