import { Card, Col, DatePicker, Row } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { TeamOutlined, CarryOutOutlined, RetweetOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { Column, Pie, Line } from '@ant-design/charts';
import { Api } from '@foodiebus/api-client';
import { PageHeader, StatCard, colors, formatPercent } from '@foodiebus/ui';
import { http } from '../api.js';
import type { BookingFunnel, PaymentFunnel, PassengerOverview } from '@foodiebus/types';

const api = new Api(http);
const { RangePicker } = DatePicker;

export function AnalyticsPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(30, 'day'), dayjs()]);

  const from = range[0].format('YYYY-MM-DD');
  const to = range[1].format('YYYY-MM-DD');

  const { data: growth } = useQuery({
    queryKey: ['platform-growth', from, to],
    queryFn: () => api.platformGrowth(from, to, 'daily'),
  });

  const { data: bookingFunnel } = useQuery({
    queryKey: ['booking-funnel', from, to],
    queryFn: () => api.bookingFunnel(from, to) as Promise<BookingFunnel>,
  });

  const { data: paymentFunnel } = useQuery({
    queryKey: ['payment-funnel', from, to],
    queryFn: () => api.paymentFunnel(from, to) as Promise<PaymentFunnel>,
  });

  const { data: passengers } = useQuery({
    queryKey: ['passenger-overview', from, to],
    queryFn: () => api.passengerOverview(from, to) as Promise<PassengerOverview>,
  });

  const { data: tripUtil } = useQuery({
    queryKey: ['trip-utilization', from, to],
    queryFn: () => api.tripUtilization(from, to),
  });

  const growthData = (growth?.items ?? []).map((i) => ({
    period: i.period.slice(0, 10),
    value: Number(i.revenue),
    category: 'Revenue',
  }));

  const bookingPie = bookingFunnel
    ? [
        { type: 'Pending', value: bookingFunnel.pending },
        { type: 'Confirmed', value: bookingFunnel.confirmed },
        { type: 'Cancelled', value: bookingFunnel.cancelled },
        { type: 'Expired', value: bookingFunnel.expired },
      ]
    : [];

  const paymentPie = paymentFunnel
    ? [
        { type: 'Pending', value: paymentFunnel.pending },
        { type: 'Paid', value: paymentFunnel.paid },
        { type: 'Failed', value: paymentFunnel.failed },
        { type: 'Refunded', value: paymentFunnel.refunded },
      ]
    : [];

  const utilData = (
    (tripUtil?.items as { route?: string; utilization: number }[] | undefined) ?? []
  ).map((i) => ({
    route: i.route ?? 'Unknown',
    utilization: i.utilization,
  }));

  return (
    <>
      <PageHeader title="Platform Analytics" />
      <RangePicker
        style={{ marginBottom: 16 }}
        value={range}
        onChange={(v) => {
          if (v && v[0] && v[1]) setRange([v[0], v[1]]);
        }}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Revenue trend" loading={!growth}>
            <Column data={growthData} xField="period" yField="value" height={260} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Booking funnel" loading={!bookingFunnel}>
            <Pie data={bookingPie} angleField="value" colorField="type" height={260} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Payment funnel" loading={!paymentFunnel}>
            <Pie data={paymentPie} angleField="value" colorField="type" height={260} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Trip utilization" loading={!tripUtil}>
            <Line data={utilData} xField="route" yField="utilization" height={260} />
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={8}>
          <StatCard
            title="Unique passengers"
            value={passengers?.uniquePassengers ?? 0}
            icon={<TeamOutlined />}
            loading={!passengers}
            color={colors.info}
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard
            title="Avg bookings / passenger"
            value={passengers?.avgBookingsPerPassenger ?? 0}
            icon={<CarryOutOutlined />}
            loading={!passengers}
            color={colors.primary}
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard
            title="Repeat passenger rate"
            value={formatPercent(passengers?.repeatPassengerRate)}
            icon={<RetweetOutlined />}
            loading={!passengers}
            color={colors.success}
          />
        </Col>
      </Row>
    </>
  );
}
