import { Card, Rate, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Api } from '@foodiebus/api-client';
import { formatDate } from '@foodiebus/ui';
import { http } from '../api.js';
import { useAuth } from '@foodiebus/auth';

const api = new Api(http);

export function VendorRatings() {
  const { user } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ['vendor-profile'],
    queryFn: () => api.getVendorProfile(),
    enabled: !!user,
  });

  const vendorId = profile?.id;

  const { data: ratings, isLoading } = useQuery({
    queryKey: ['vendor-ratings', vendorId],
    queryFn: () => api.listRatings({ entityType: 'VENDOR', entityId: vendorId!, limit: 100 }),
    enabled: !!vendorId,
  });

  const columns = [
    {
      title: 'User',
      dataIndex: ['user', 'fullName'],
      key: 'user',
    },
    {
      title: 'Rating',
      dataIndex: 'score',
      key: 'score',
      render: (v: number) => <Rate disabled value={v} />,
    },
    {
      title: 'Comment',
      dataIndex: 'comment',
      key: 'comment',
    },
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => formatDate(v),
    },
  ];

  const avg = ratings?.items.length
    ? (ratings.items.reduce((s, r) => s + r.score, 0) / ratings.items.length).toFixed(1)
    : null;

  return (
    <>
      <Typography.Title level={3}>Ratings &amp; Reviews</Typography.Title>
      {avg && (
        <Card style={{ marginBottom: 16 }}>
          <Typography.Text strong style={{ marginRight: 8 }}>
            Average rating:
          </Typography.Text>
          <Rate disabled value={Number(avg)} />
          <Typography.Text style={{ marginLeft: 8 }}>({avg})</Typography.Text>
        </Card>
      )}
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={ratings?.items ?? []}
          loading={isLoading}
        />
      </Card>
    </>
  );
}
