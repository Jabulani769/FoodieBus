import { Card, Col, Row, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { FileDoneOutlined, ShopOutlined, WalletOutlined } from '@ant-design/icons';
import { Api } from '@foodiebus/api-client';
import {
  formatMoney,
  StatCard,
  EmptyState,
  PageHeader,
  colors,
  cardStyle,
  StatusBadge,
} from '@foodiebus/ui';
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
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <StatusBadge status={v} />,
    },
    {
      title: 'Amount',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      render: (v: string) => formatMoney(v),
    },
  ];

  return (
    <>
      <PageHeader title="Vendor Dashboard" subtitle="Your on-board dining at a glance" />
      <Card style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: `${colors.primary}14`,
              color: colors.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
            }}
          >
            <ShopOutlined />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {profile?.businessName || 'Your business'}
            </div>
            <div style={{ fontSize: 13, color: colors.text.secondary }}>
              {profile?.description || 'Welcome back, manage your menu and orders below.'}
            </div>
          </div>
        </div>
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="Active orders"
            value={activeOrders}
            icon={<FileDoneOutlined />}
            loading={!orders}
            color={colors.warning}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="Available dishes"
            value={availableDishes}
            icon={<ShopOutlined />}
            loading={!dishes}
            color={colors.success}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="Recent order value"
            value={formatMoney(revenue)}
            icon={<WalletOutlined />}
            loading={!orders}
            color={colors.primary}
          />
        </Col>
      </Row>
      <Card title="Recent orders" style={{ ...cardStyle, marginTop: 16 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={orders?.items ?? []}
          pagination={false}
          loading={!orders}
          locale={{ emptyText: <EmptyState title="No recent orders" /> }}
        />
      </Card>
    </>
  );
}
