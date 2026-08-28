import { useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Table,
  Switch,
  message,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { EmptyState, PageHeader, cardStyle } from '@foodiebus/ui';
import { http } from '../api.js';

const api = new Api(http);

type RouteStop = {
  city: string;
  departureOffsetMinutes: number;
  segmentPrice: number;
};

type RouteRow = {
  id: string;
  fromCity: string;
  toCity: string;
  basePrice: string;
  distanceKm?: number;
  isActive?: boolean;
  stops?: RouteStop[];
};

export function RoutesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [form] = Form.useForm();

  const [stopsOpen, setStopsOpen] = useState(false);
  const [stopsRoute, setStopsRoute] = useState<RouteRow | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['routes'],
    queryFn: () => api.listRoutes(),
  });

  const save = useMutation({
    mutationFn: (values: {
      fromCity: string;
      toCity: string;
      basePrice: number;
      distanceKm?: number;
    }) => (editing ? api.updateRoute(editing.id, values) : api.createRoute(values)),
    onSuccess: () => {
      message.success('Route saved');
      setModalOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const deleteRoute = useMutation({
    mutationFn: (id: string) => api.deleteRoute(id),
    onSuccess: () => {
      message.success('Route deleted');
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const toggle = useMutation({
    mutationFn: (row: RouteRow) => api.updateRoute(row.id, { isActive: !row.isActive }),
    onSuccess: () => {
      message.success('Route updated');
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const saveStops = useMutation({
    mutationFn: () => http.put(`/bus-routes/${stopsRoute!.id}/stops`, { stops }),
    onSuccess: () => {
      message.success('Stops updated');
      setStopsOpen(false);
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const columns = [
    { title: 'From', dataIndex: 'fromCity', key: 'fromCity', width: 160, ellipsis: true },
    { title: 'To', dataIndex: 'toCity', key: 'toCity', width: 160, ellipsis: true },
    {
      title: 'Base price',
      dataIndex: 'basePrice',
      key: 'basePrice',
      width: 120,
      render: (v: string) => v,
    },
    {
      title: 'Distance (km)',
      dataIndex: 'distanceKm',
      key: 'distanceKm',
      width: 120,
      render: (v?: number) => v ?? '—',
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 90,
      render: (v: boolean | undefined, record: RouteRow) => (
        <Switch checked={!!v} onChange={() => toggle.mutate(record)} />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 240,
      render: (_: unknown, record: RouteRow) => (
        <Space>
          <Button size="small" onClick={() => openStops(record)}>
            Stops
          </Button>
          <Button
            size="small"
            onClick={() => {
              setEditing(record);
              form.setFieldsValue({
                fromCity: record.fromCity,
                toCity: record.toCity,
                basePrice: Number(record.basePrice),
                distanceKm: record.distanceKm,
              });
              setModalOpen(true);
            }}
          >
            Edit
          </Button>
          <Popconfirm title="Delete this route?" onConfirm={() => deleteRoute.mutate(record.id)}>
            <Button size="small" danger>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  function openStops(record: RouteRow) {
    setStopsRoute(record);
    const existing = (record.stops ?? []).map((s) => ({
      city: s.city,
      departureOffsetMinutes: Number(s.departureOffsetMinutes),
      segmentPrice: Number(s.segmentPrice),
    }));
    if (existing.length < 2) {
      setStops([
        {
          city: record.fromCity,
          departureOffsetMinutes: 0,
          segmentPrice: Number(record.basePrice),
        },
        { city: record.toCity, departureOffsetMinutes: 0, segmentPrice: 0 },
      ]);
    } else {
      setStops(existing);
    }
    setStopsOpen(true);
  }

  function setStopField(index: number, field: keyof RouteStop, value: string | number) {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  return (
    <>
      <PageHeader title="Routes" subtitle="Intercity bus routes (admin only)" />
      <Card
        style={cardStyle}
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              form.resetFields();
              setModalOpen(true);
            }}
          >
            New route
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={(data?.items ?? []) as RouteRow[]}
          loading={isLoading}
          tableLayout="fixed"
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <EmptyState title="No routes yet" /> }}
        />
      </Card>

      <Modal
        title={editing ? 'Edit route' : 'New route'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item
            name="fromCity"
            label="From city"
            rules={[{ required: true, message: 'From city required' }]}
          >
            <Input placeholder="e.g. Blantyre" />
          </Form.Item>
          <Form.Item
            name="toCity"
            label="To city"
            rules={[{ required: true, message: 'To city required' }]}
          >
            <Input placeholder="e.g. Lilongwe" />
          </Form.Item>
          <Form.Item
            name="basePrice"
            label="Base price"
            rules={[{ required: true, message: 'Base price required' }]}
          >
            <InputNumber min={0} step={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="distanceKm" label="Distance (km)">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Stops — ${stopsRoute?.fromCity} → ${stopsRoute?.toCity}`}
        open={stopsOpen}
        onCancel={() => setStopsOpen(false)}
        onOk={() => saveStops.mutate()}
        confirmLoading={saveStops.isPending}
        width={640}
      >
        <p style={{ color: '#888' }}>
          At least two stops (origin and destination). Offsets are minutes after departure; segment
          price is the fare to that stop.
        </p>
        {stops.map((stop, index) => (
          <Space key={index} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
            <Input
              placeholder="City"
              value={stop.city}
              onChange={(e) => setStopField(index, 'city', e.target.value)}
              style={{ width: 200 }}
            />
            <InputNumber
              placeholder="Offset (min)"
              min={0}
              value={stop.departureOffsetMinutes}
              onChange={(v) => setStopField(index, 'departureOffsetMinutes', Number(v ?? 0))}
            />
            <InputNumber
              placeholder="Segment price"
              min={0}
              value={stop.segmentPrice}
              onChange={(v) => setStopField(index, 'segmentPrice', Number(v ?? 0))}
            />
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={stops.length <= 2}
              onClick={() => setStops((prev) => prev.filter((_, i) => i !== index))}
            />
          </Space>
        ))}
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() =>
            setStops((prev) => [...prev, { city: '', departureOffsetMinutes: 0, segmentPrice: 0 }])
          }
        >
          Add stop
        </Button>
      </Modal>
    </>
  );
}
