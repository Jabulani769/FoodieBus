import { Col, Row } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  WalletOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { Api } from '@foodiebus/api-client';
import { StatCard, PageHeader, colors, formatMoney } from '@foodiebus/ui';
import { http } from '../api.js';
import type { PlatformOverview } from '@foodiebus/types';

const api = new Api(http);

export function FinancialDashboard() {
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

  return (
    <>
      <PageHeader title="Financial Dashboard" subtitle="Platform financial overview" />
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
    </>
  );
}
