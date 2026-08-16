import { Card, Col, Row, Statistic, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Api } from '@foodiebus/api-client';
import { formatMoney } from '@foodiebus/ui';
import { http } from '../api.js';

const api = new Api(http);

type DashboardStats = {
  totalUsers: number;
  totalBookings: number;
  pendingBookings: number;
  activeVendors: number;
  activeOperators: number;
  revenue: { total: string; paidPayments: number };
  users: Record<string, number>;
  bookings: Record<string, number>;
};

export function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.getAdminDashboard() as Promise<DashboardStats>,
  });

  return (
    <>
      <Typography.Title level={3}>Admin Dashboard</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={isLoading}>
            <Statistic title="Total users" value={data?.totalUsers ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={isLoading}>
            <Statistic title="Total bookings" value={data?.totalBookings ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={isLoading}>
            <Statistic title="Pending bookings" value={data?.pendingBookings ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={isLoading}>
            <Statistic title="Paid revenue" value={formatMoney(data?.revenue?.total ?? '0')} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={isLoading}>
            <Statistic title="Active vendors" value={data?.activeVendors ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={isLoading}>
            <Statistic title="Active operators" value={data?.activeOperators ?? 0} />
          </Card>
        </Col>
      </Row>
    </>
  );
}
