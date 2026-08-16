import { Card, Col, Row, Statistic, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Api } from '@foodiebus/api-client';
import { formatMoney, formatDate, StatusBadge } from '@foodiebus/ui';
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
        `${route.fromCity} → ${route.toCity}`,
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
      <Typography.Title level={3}>Operator Dashboard</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Active trips" value={activeTrips.length} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Fleet size" value={fleetSize} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Scheduled trips"
              value={ownTrips.filter((t) => t.status === 'SCHEDULED').length}
            />
          </Card>
        </Col>
      </Row>
      <Card title="Upcoming trips" style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={activeTrips}
          pagination={false}
          loading={!trips}
        />
      </Card>
    </>
  );
}
