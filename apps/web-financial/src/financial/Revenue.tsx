import { Card, Col, DatePicker, Row, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
  WalletOutlined,
  CreditCardOutlined,
  CoffeeOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { Api } from '@foodiebus/api-client';
import { formatMoney, StatCard, EmptyState, PageHeader, colors } from '@foodiebus/ui';
import { http } from '../api.js';

const api = new Api(http);
const { RangePicker } = DatePicker;

type RevenueReport = {
  totalRevenue: string;
  totalPayments: number;
  foodOrders: number;
  refunds: string;
  daily: { date: string; revenue: string; payments: number }[];
};

type RouteItem = { route: string; revenue: string; payments: number };
type OperatorItem = { operator: string; revenue: string; payments: number };

export function RevenuePage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(30, 'day'), dayjs()]);

  const from = range[0].format('YYYY-MM-DD');
  const to = range[1].format('YYYY-MM-DD');

  const { data: report, isLoading } = useQuery({
    queryKey: ['revenue', from, to],
    queryFn: () => api.getRevenue(from, to) as Promise<RevenueReport>,
  });

  const { data: byRoute } = useQuery({
    queryKey: ['revenue-by-route', from, to],
    queryFn: () => api.getRevenueByRoute(from, to) as Promise<{ items: RouteItem[] }>,
  });

  const { data: byOperator } = useQuery({
    queryKey: ['revenue-by-operator', from, to],
    queryFn: () => api.getRevenueByOperator(from, to) as Promise<{ items: OperatorItem[] }>,
  });

  const dailyColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date' },
    {
      title: 'Revenue',
      dataIndex: 'revenue',
      key: 'revenue',
      render: (v: string) => formatMoney(v),
    },
    { title: 'Payments', dataIndex: 'payments', key: 'payments' },
  ];

  const routeColumns = [
    { title: 'Route', dataIndex: 'route', key: 'route' },
    {
      title: 'Revenue',
      dataIndex: 'revenue',
      key: 'revenue',
      render: (v: string) => formatMoney(v),
    },
    { title: 'Payments', dataIndex: 'payments', key: 'payments' },
  ];

  const operatorColumns = [
    { title: 'Operator', dataIndex: 'operator', key: 'operator' },
    {
      title: 'Revenue',
      dataIndex: 'revenue',
      key: 'revenue',
      render: (v: string) => formatMoney(v),
    },
    { title: 'Payments', dataIndex: 'payments', key: 'payments' },
  ];

  return (
    <>
      <PageHeader title="Revenue Reports" />
      <RangePicker
        style={{ marginBottom: 16 }}
        value={range}
        onChange={(v) => {
          if (v && v[0] && v[1]) setRange([v[0], v[1]]);
        }}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total revenue"
            value={formatMoney(report?.totalRevenue ?? '0')}
            icon={<WalletOutlined />}
            loading={isLoading}
            color={colors.success}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Payments"
            value={report?.totalPayments ?? 0}
            icon={<CreditCardOutlined />}
            loading={isLoading}
            color={colors.primary}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Food orders"
            value={report?.foodOrders ?? 0}
            icon={<CoffeeOutlined />}
            loading={isLoading}
            color={colors.info}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Refunds"
            value={formatMoney(report?.refunds ?? '0')}
            icon={<UndoOutlined />}
            loading={isLoading}
            color={colors.danger}
          />
        </Col>
      </Row>
      <Card title="Daily revenue" style={{ marginTop: 16 }}>
        <Table
          rowKey="date"
          columns={dailyColumns}
          dataSource={report?.daily ?? []}
          loading={isLoading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <EmptyState title="No revenue data for this period" /> }}
        />
      </Card>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="By route">
            <Table
              rowKey="route"
              columns={routeColumns}
              dataSource={byRoute?.items ?? []}
              loading={!byRoute}
              pagination={false}
              locale={{ emptyText: <EmptyState title="No route revenue yet" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="By operator">
            <Table
              rowKey="operator"
              columns={operatorColumns}
              dataSource={byOperator?.items ?? []}
              loading={!byOperator}
              pagination={false}
              locale={{ emptyText: <EmptyState title="No operator revenue yet" /> }}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}
