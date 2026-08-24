import { Avatar, Card, Col, Row, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useAuth } from '@foodiebus/auth';
import { Api } from '@foodiebus/api-client';
import {
  WalletOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import {
  StatCard,
  PageHeader,
  colors,
  formatMoney,
  formatDate,
  cardStyle,
  StatusBadge,
} from '@foodiebus/ui';
import { http } from '../api.js';
import type { PlatformOverview } from '@foodiebus/types';

const api = new Api(http);
const { Title, Text } = Typography;

export function FinancialDashboard() {
  const { user } = useAuth();
  const today = dayjs().format('YYYY-MM-DD');
  const lastMonth = dayjs().subtract(1, 'month').format('YYYY-MM-DD');

  const { data, isLoading } = useQuery({
    queryKey: ['platform-overview', lastMonth, today],
    queryFn: () => api.platformOverview(lastMonth, today),
  });

  const overview = data as PlatformOverview | undefined;
  const current = overview?.current;
  const previous = overview?.previous;

  const trend = (v?: number, p?: number) => (v != null && p ? ((v - p) / p) * 100 : null);

  const { data: paymentsData } = useQuery({
    queryKey: ['recent-payments'],
    queryFn: () => api.listPayments({ limit: 5 }),
  });
  const recentPayments = paymentsData?.items ?? [];

  const firstName = (user?.fullName || user?.email || 'there').split(' ')[0];
  const initial = (firstName || 'U').charAt(0).toUpperCase();

  const paymentColumns = [
    {
      title: 'Passenger',
      key: 'passenger',
      render: (_: unknown, record: { passenger?: { fullName: string; email: string } }) =>
        record.passenger?.fullName || record.passenger?.email || '—',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (value: string) => formatMoney(value),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <StatusBadge status={value} />,
    },
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDate(value),
    },
  ];

  return (
    <>
      <PageHeader title="Financial Dashboard" subtitle="Platform financial overview" />

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
            <Text type="secondary">Here&apos;s the platform financial snapshot for today.</Text>
          </div>
        </div>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Revenue"
            value={formatMoney(current?.revenue ?? 0)}
            icon={<WalletOutlined />}
            trend={trend(current?.revenue, previous?.revenue)}
            loading={isLoading}
            color={colors.success}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Paid payments"
            value={current?.paidPayments ?? 0}
            icon={<CheckCircleOutlined />}
            trend={trend(current?.paidPayments, previous?.paidPayments)}
            loading={isLoading}
            color={colors.primary}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Bookings"
            value={current?.bookings ?? 0}
            icon={<CalendarOutlined />}
            trend={trend(current?.bookings, previous?.bookings)}
            loading={isLoading}
            color={colors.info}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="New users"
            value={current?.newUsers ?? 0}
            icon={<UserAddOutlined />}
            trend={trend(current?.newUsers, previous?.newUsers)}
            loading={isLoading}
            color={colors.warning}
          />
        </Col>
      </Row>

      <Card title="Recent payments" style={{ ...cardStyle, marginTop: 24 }}>
        <Table
          rowKey="id"
          size="middle"
          columns={paymentColumns}
          dataSource={recentPayments}
          pagination={false}
        />
      </Card>
    </>
  );
}
