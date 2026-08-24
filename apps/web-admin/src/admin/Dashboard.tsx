import { Avatar, Card, Col, Row, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@foodiebus/auth';
import { Api } from '@foodiebus/api-client';
import {
  UserOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  WalletOutlined,
  ShopOutlined,
  CarOutlined,
} from '@ant-design/icons';
import { StatCard, PageHeader, colors, formatMoney, formatDate, cardStyle } from '@foodiebus/ui';
import { http } from '../api.js';

const api = new Api(http);
const { Title, Text } = Typography;

type DashboardStats = {
  totalUsers: number;
  totalBookings: number;
  pendingBookings: number;
  activeVendors: number;
  activeOperators: number;
  revenue: { total: string };
};

export function AdminDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.getAdminDashboard() as Promise<DashboardStats>,
  });

  const { data: usersData } = useQuery({
    queryKey: ['recent-users'],
    queryFn: () => api.listUsers({ limit: 5 }),
  });
  const recentUsers = usersData?.items ?? [];

  const firstName = (user?.fullName || user?.email || 'there').split(' ')[0];
  const initial = (firstName || 'U').charAt(0).toUpperCase();

  const userColumns = [
    {
      title: 'Name',
      dataIndex: 'fullName',
      key: 'fullName',
      render: (value: string, record: { email: string }) => value || record.email,
    },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: 'Joined',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDate(value),
    },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Platform overview at a glance" />

      <Card style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar
            size={56}
            style={{
              backgroundColor: colors.primary,
              fontSize: 22,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {initial}
          </Avatar>
          <div>
            <Title level={4} style={{ margin: 0, color: colors.text.primary }}>
              Welcome, {firstName}
            </Title>
            <Text type="secondary">
              Here&apos;s what&apos;s happening across the platform today.
            </Text>
          </div>
        </div>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="Total users"
            value={data?.totalUsers ?? 0}
            icon={<UserOutlined />}
            loading={isLoading}
            color={colors.primary}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="Total bookings"
            value={data?.totalBookings ?? 0}
            icon={<CalendarOutlined />}
            loading={isLoading}
            color={colors.success}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="Pending bookings"
            value={data?.pendingBookings ?? 0}
            icon={<ClockCircleOutlined />}
            loading={isLoading}
            color={colors.warning}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="Paid revenue"
            value={formatMoney(data?.revenue?.total ?? '0')}
            icon={<WalletOutlined />}
            loading={isLoading}
            color={colors.success}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="Active vendors"
            value={data?.activeVendors ?? 0}
            icon={<ShopOutlined />}
            loading={isLoading}
            color={colors.info}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="Active operators"
            value={data?.activeOperators ?? 0}
            icon={<CarOutlined />}
            loading={isLoading}
            color={colors.primary}
          />
        </Col>
      </Row>

      <Card title="Recent users" style={{ ...cardStyle, marginTop: 24 }}>
        <Table
          rowKey="id"
          size="middle"
          columns={userColumns}
          dataSource={recentUsers}
          pagination={false}
        />
      </Card>
    </>
  );
}
