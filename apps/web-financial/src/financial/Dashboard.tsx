import { Card, Col, Row, Statistic, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Api } from '@foodiebus/api-client';
import { formatMoney } from '@foodiebus/ui';
import { http } from '../api.js';
import type { PlatformOverview } from '@foodiebus/types';

const api = new Api(http);

const fmt = (v: number) => formatMoney(String(v));

export function FinancialDashboard() {
  const today = dayjs().format('YYYY-MM-DD');
  const lastMonth = dayjs().subtract(1, 'month').format('YYYY-MM-DD');

  const { data, isLoading } = useQuery({
    queryKey: ['platform-overview', lastMonth, today],
    queryFn: () => api.platformOverview(lastMonth, today),
  });

  const overview = data as PlatformOverview | undefined;
  const current = overview?.current;

  return (
    <>
      <Typography.Title level={3}>Financial Dashboard</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={isLoading}>
            <Statistic title="Revenue" value={fmt(current?.revenue ?? 0)} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={isLoading}>
            <Statistic title="Paid payments" value={current?.paidPayments ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={isLoading}>
            <Statistic title="Bookings" value={current?.bookings ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={isLoading}>
            <Statistic title="New users" value={current?.newUsers ?? 0} />
          </Card>
        </Col>
      </Row>
    </>
  );
}
