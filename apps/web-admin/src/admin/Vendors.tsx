import { Button, Card, Table, Tag, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { formatDate, EmptyState, PageHeader } from '@foodiebus/ui';
import { http } from '../api.js';

const api = new Api(http);

type VendorRow = {
  id: string;
  businessName: string;
  isActive?: boolean;
  createdAt?: string;
  user?: { email: string; fullName: string };
};

export function VendorsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => api.listVendors({ limit: 100 }),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => api.approveVendor(id),
    onSuccess: () => {
      message.success('Vendor status updated');
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
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
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag>,
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
      render: (_: unknown, record: VendorRow) => (
        <Button size="small" onClick={() => toggle.mutate(record.id)}>
          {record.isActive ? 'Deactivate' : 'Approve'}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Vendors" subtitle="Manage onboard dining vendors" />
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={(data?.items ?? []) as VendorRow[]}
          loading={isLoading}
          tableLayout="fixed"
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <EmptyState title="No vendors yet" /> }}
        />
      </Card>
    </>
  );
}
