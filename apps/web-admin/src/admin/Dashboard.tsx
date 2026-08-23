import { Col, Row } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
  UserOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  WalletOutlined,
  ShopOutlined,
  CarOutlined,
} from '@ant-design/icons';
import { Api } from '@foodiebus/api-client';
import { StatCard, PageHeader, colors, formatMoney } from '@foodiebus/ui';
import { http } from '../api.js';

const api = new Api(http);

type DashboardStats = {
  totalUsers: number;
  totalBookings: number;
  pendingBookings: number;
  activeVendors: number;
  activeOperators: number;
  revenue: { total: string };
};

export function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.getAdminDashboard() as Promise<DashboardStats>,
  });

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Platform overview at a glance" />
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
    </>
  );
}
