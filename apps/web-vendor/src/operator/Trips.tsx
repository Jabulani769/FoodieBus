import { useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Form,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api } from '@foodiebus/api-client';
import { extractError } from '@foodiebus/api-client';
import { formatMoney, formatDate, StatusBadge, EmptyState, PageHeader } from '@foodiebus/ui';
import { http } from '../api.js';
import { useAuth } from '@foodiebus/auth';
import type { TripStatus } from '@foodiebus/types';

const api = new Api(http);

const NEXT_STATUS: Record<TripStatus, TripStatus[]> = {
  SCHEDULED: ['BOARDING', 'CANCELLED'],
  BOARDING: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function TripsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const { data: profile } = useQuery({
    queryKey: ['operator-profile'],
    queryFn: () => api.getOperatorProfile(),
    enabled: !!user,
  });
  const operatorId = profile?.id;

  const { data: routes } = useQuery({ queryKey: ['routes'], queryFn: () => api.listRoutes() });
  const { data: buses } = useQuery({
    queryKey: ['operator-buses', operatorId],
    queryFn: () => api.listOperatorBuses(operatorId!),
    enabled: !!operatorId,
  });
  const { data: drivers } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.listDrivers(),
    enabled: !!user && user.role === 'OPERATOR',
  });

  const { data: trips, isLoading } = useQuery({
    queryKey: ['trips'],
    queryFn: () => api.searchTrips({ limit: 100 }),
  });

  const createTrip = useMutation({
    mutationFn: (values: {
      routeId: string;
      busId: string;
      departureTime: string;
      arrivalTime: string;
      price: number;
    }) => api.createTrip(values),
    onSuccess: () => {
      message.success('Trip scheduled');
      setModalOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TripStatus }) =>
      api.updateTripStatus(id, status),
    onSuccess: () => {
      message.success('Trip status updated');
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const assignDriver = useMutation({
    mutationFn: ({ tripId, driverId }: { tripId: string; driverId: string }) =>
      api.assignDriver(tripId, driverId),
    onSuccess: () => {
      message.success('Driver assigned');
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

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
      render: (v: TripStatus) => <StatusBadge status={v} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: { id: string; status: TripStatus }) => {
        const next = NEXT_STATUS[record.status];
        return (
          <Space wrap>
            {next.map((s) => (
              <Button
                key={s}
                size="small"
                type={s === 'CANCELLED' ? 'dashed' : 'primary'}
                danger={s === 'CANCELLED'}
                onClick={() => changeStatus.mutate({ id: record.id, status: s })}
              >
                {s}
              </Button>
            ))}
            <Select
              size="small"
              placeholder="Assign driver"
              style={{ minWidth: 130 }}
              onChange={(driverId) => assignDriver.mutate({ tripId: record.id, driverId })}
              options={(drivers?.items ?? []).map((d) => ({ label: d.user.fullName, value: d.id }))}
            />
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader title="Trips &amp; Schedules" />
      <Card
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Schedule trip
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={trips?.items ?? []}
          loading={isLoading}
          locale={{ emptyText: <EmptyState title="No trips scheduled yet" /> }}
        />
      </Card>
      <Modal
        title="Schedule trip"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createTrip.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => {
            createTrip.mutate({
              routeId: v.routeId,
              busId: v.busId,
              departureTime: v.departureTime.toISOString(),
              arrivalTime: v.arrivalTime.toISOString(),
              price: v.price,
            });
          }}
        >
          <Form.Item
            name="routeId"
            label="Route"
            rules={[{ required: true, message: 'Route required' }]}
          >
            <Select
              options={(routes?.items ?? []).map((r) => ({
                label: `${r.fromCity} → ${r.toCity}`,
                value: r.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="busId" label="Bus" rules={[{ required: true, message: 'Bus required' }]}>
            <Select
              options={(buses?.items ?? []).map((b) => ({
                label: `${b.name} (${b.plateNumber})`,
                value: b.id,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="departureTime"
            label="Departure"
            rules={[{ required: true, message: 'Departure required' }]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="arrivalTime"
            label="Arrival"
            rules={[{ required: true, message: 'Arrival required' }]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="price"
            label="Price (MWK)"
            rules={[{ required: true, message: 'Price required' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
