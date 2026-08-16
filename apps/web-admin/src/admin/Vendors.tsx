import { Button, Card, Table, Tag, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { formatDate } from '@foodiebus/ui';
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
    { title: 'Business name', dataIndex: 'businessName', key: 'businessName' },
    { title: 'Owner', dataIndex: ['user', 'fullName'], key: 'owner' },
    { title: 'Email', dataIndex: ['user', 'email'], key: 'email' },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag>,
    },
    {
      title: 'Registered',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => formatDate(v),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: VendorRow) => (
        <Button size="small" onClick={() => toggle.mutate(record.id)}>
          {record.isActive ? 'Deactivate' : 'Approve'}
        </Button>
      ),
    },
  ];

  return (
    <>
      <Typography.Title level={3}>Vendors</Typography.Title>
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={(data?.items ?? []) as VendorRow[]}
          loading={isLoading}
        />
      </Card>
    </>
  );
}
