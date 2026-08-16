import { Card, Col, Row, Statistic, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Api } from '@foodiebus/api-client';
import { formatMoney } from '@foodiebus/ui';
import { http } from '../api.js';
import { useAuth } from '@foodiebus/auth';

const api = new Api(http);

export function VendorDashboard() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ['vendor-profile'],
    queryFn: () => api.getVendorProfile(),
    enabled: !!user,
  });

  const vendorId = profile?.id;
  const { data: orders } = useQuery({
    queryKey: ['vendor-orders', vendorId],
    queryFn: () => api.listVendorOrders(vendorId!, { limit: 5 }),
    enabled: !!vendorId,
  });

  const { data: dishes } = useQuery({
    queryKey: ['vendor-dishes', vendorId],
    queryFn: () => api.listDishes(vendorId!, { limit: 100 }),
    enabled: !!vendorId,
  });

  const activeOrders =
    orders?.items.filter((o) => !['DELIVERED_TO_BUS', 'CANCELLED'].includes(o.status)).length ?? 0;
  const availableDishes = dishes?.items.filter((d) => d.isAvailable).length ?? 0;
  const revenue = orders?.items.reduce((sum, o) => sum + Number(o.totalAmount), 0) ?? 0;

  const columns = [
    { title: 'Order', dataIndex: 'id', key: 'id', ellipsis: true },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    {
      title: 'Amount',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      render: (v: string) => formatMoney(v),
    },
  ];

  return (
    <>
      <Typography.Title level={3}>Vendor Dashboard</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Active orders" value={activeOrders} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Available dishes" value={availableDishes} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Recent order value" value={formatMoney(revenue)} />
          </Card>
        </Col>
      </Row>
      <Card title="Recent orders" style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={orders?.items ?? []}
          pagination={false}
          loading={!orders}
        />
      </Card>
    </>
  );
}
