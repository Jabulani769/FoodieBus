import { Button, Card, Table, Tag, Tooltip, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { formatDate, StatusBadge, EmptyState, cardStyle, PageHeader } from '@foodiebus/ui';
import { http } from '../api.js';
import { VendorsMap } from '../components/VendorsMap.js';

const api = new Api(http);

type VendorRow = {
  id: string;
  businessName: string;
  isActive?: boolean;
  createdAt?: string;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
      title: 'Location',
      key: 'location',
      width: 220,
      ellipsis: true,
      render: (_: unknown, record: VendorRow) => {
        if (typeof record.latitude === 'number' && typeof record.longitude === 'number') {
          const place = [record.address, record.city].filter(Boolean).join(', ');
          return (
            <Tooltip title={`${record.latitude.toFixed(5)}, ${record.longitude.toFixed(5)}`}>
              <span>
                {place || `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}`}{' '}
                <Tag color="green">pinned</Tag>
              </span>
            </Tooltip>
          );
        }
        return <Tag color="orange">no pin — vendor must set</Tag>;
      },
    },
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
      render: (_: unknown, record: VendorRow) => {
        const hasPin =
          typeof record.latitude === 'number' && typeof record.longitude === 'number';
        return (
          <Tooltip
            title={
              !record.isActive && !hasPin
                ? 'Cannot approve: vendor has not set shop pin yet'
                : undefined
            }
          >
            <Button size="small" onClick={() => toggle.mutate(record.id)}>
              {record.isActive ? 'Deactivate' : 'Approve'}
            </Button>
          </Tooltip>
        );
      },
    },
  ];

  const items = ((data?.items ?? []) as VendorRow[]).slice();
  const pinned = items.filter(
    (v) => typeof v.latitude === 'number' && typeof v.longitude === 'number',
  ).length;

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle={`Manage onboard dining vendors — ${pinned}/${items.length} with shop pin`}
      />
      <Card title="Restaurant locations" style={{ ...cardStyle, marginBottom: 16 }}>
        <VendorsMap vendors={items} />
      </Card>
      <Card style={cardStyle}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={items as VendorRow[]}
          loading={isLoading}
          tableLayout="fixed"
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <EmptyState title="No vendors yet" /> }}
        />
      </Card>
    </>
  );
}
