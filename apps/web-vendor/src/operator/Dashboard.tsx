import { Card, Col, Row, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { ScheduleOutlined, CarOutlined, RocketOutlined } from '@ant-design/icons';
import { Api } from '@foodiebus/api-client';
import {
  formatMoney,
  formatDate,
  StatCard,
  EmptyState,
  PageHeader,
  colors,
  StatusBadge,
} from '@foodiebus/ui';
import { http } from '../api.js';
import { useAuth } from '@foodiebus/auth';

const api = new Api(http);

export function OperatorDashboard() {
  const { user } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ['operator-profile'],
    queryFn: () => api.getOperatorProfile(),
    enabled: !!user,
  });

  const operatorId = profile?.id;

  const { data: buses } = useQuery({
    queryKey: ['operator-buses', operatorId],
    queryFn: () => api.listOperatorBuses(operatorId!),
    enabled: !!operatorId,
  });

  const { data: trips } = useQuery({
    queryKey: ['trips'],
    queryFn: () => api.searchTrips({ limit: 100 }),
  });

  const ownTrips = trips?.items ?? [];
  const activeTrips = ownTrips.filter((t) =>
    ['SCHEDULED', 'BOARDING', 'IN_TRANSIT'].includes(t.status),
  );
  const fleetSize = buses?.items.filter((b) => b.isActive).length ?? 0;

  const columns = [
    {
      title: 'Route',
      dataIndex: ['route'],
      key: 'route',
      render: (route: { fromCity: string; toCity: string }) =>
        `${route.fromCity} -> ${route.toCity}`,
    },
    {
      title: 'Departure',
      dataIndex: 'departureTime',
      key: 'departure',
      render: (v: string) => formatDate(v),
    },
    { title: 'Price', dataIndex: 'price', key: 'price', render: (v: string) => formatMoney(v) },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <StatusBadge status={v} />,
    },
  ];

  return (
    <>
      <PageHeader title="Operator Dashboard" subtitle="Fleet &amp; trip operations overview" />
      <Card style={{ marginBottom: 16, borderRadius: 12 }}>
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
            <CarOutlined />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {profile?.businessName || 'Your business'}
            </div>
            <div style={{ fontSize: 13, color: colors.text.secondary }}>
              {profile?.description || 'Welcome back, manage your fleet and trips below.'}
            </div>
          </div>
        </div>
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="Active trips"
            value={activeTrips.length}
            icon={<ScheduleOutlined />}
            loading={!trips}
            color={colors.primary}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="Fleet size"
            value={fleetSize}
            icon={<CarOutlined />}
            loading={!buses}
            color={colors.success}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="Scheduled trips"
            value={ownTrips.filter((t) => t.status === 'SCHEDULED').length}
            icon={<RocketOutlined />}
            loading={!trips}
            color={colors.warning}
          />
        </Col>
      </Row>
      <Card title="Upcoming trips" style={{ marginTop: 16, borderRadius: 12 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={activeTrips}
          pagination={false}
          loading={!trips}
          locale={{ emptyText: <EmptyState title="No upcoming trips" /> }}
        />
      </Card>
    </>
  );
}
