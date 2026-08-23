import { useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api } from '@foodiebus/api-client';
import { extractError } from '@foodiebus/api-client';
import { http } from '../api.js';
import { EmptyState, PageHeader } from '@foodiebus/ui';
import { useAuth } from '@foodiebus/auth';

const api = new Api(http);

export function BusesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string } | null>(null);
  const [form] = Form.useForm();

  const { data: profile } = useQuery({
    queryKey: ['operator-profile'],
    queryFn: () => api.getOperatorProfile(),
    enabled: !!user,
  });
  const operatorId = profile?.id;

  const { data: buses, isLoading } = useQuery({
    queryKey: ['operator-buses', operatorId],
    queryFn: () => api.listOperatorBuses(operatorId!),
    enabled: !!operatorId,
  });

  const saveBus = useMutation({
    mutationFn: (values: {
      name: string;
      plateNumber: string;
      capacity: number;
      busType?: string;
    }) => (editing ? api.updateBus(editing.id, values) : api.createBus(values)),
    onSuccess: () => {
      message.success('Bus saved');
      setModalOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['operator-buses'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const deleteBus = useMutation({
    mutationFn: (id: string) => api.deleteBus(id),
    onSuccess: () => {
      message.success('Bus deleted');
      queryClient.invalidateQueries({ queryKey: ['operator-buses'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const openEdit = (bus: {
    id: string;
    name: string;
    plateNumber: string;
    capacity: number;
    busType: string;
  }) => {
    setEditing({ id: bus.id });
    form.setFieldsValue(bus);
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Plate number', dataIndex: 'plateNumber', key: 'plateNumber' },
    { title: 'Capacity', dataIndex: 'capacity', key: 'capacity' },
    { title: 'Type', dataIndex: 'busType', key: 'busType' },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (v: boolean) => <Switch checked={v} disabled />,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (
        _: unknown,
        record: {
          id: string;
          name: string;
          plateNumber: string;
          capacity: number;
          busType: string;
        },
      ) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>
            Edit
          </Button>
          <Popconfirm title="Delete this bus?" onConfirm={() => deleteBus.mutate(record.id)}>
            <Button size="small" danger>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Bus Fleet" />
      <Card
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New bus
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={buses?.items ?? []}
          loading={isLoading}
          locale={{ emptyText: <EmptyState title="No buses yet" /> }}
        />
      </Card>
      <Modal
        title={editing ? 'Edit bus' : 'New bus'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveBus.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveBus.mutate(v)}>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Name required' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="plateNumber"
            label="Plate number"
            rules={[{ required: true, message: 'Plate number required' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="capacity"
            label="Capacity"
            rules={[{ required: true, message: 'Capacity required' }]}
          >
            <InputNumber min={1} max={200} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="busType" label="Bus type">
            <Select
              options={['STANDARD', 'VIP', 'EXECUTIVE'].map((t) => ({ label: t, value: t }))}
              placeholder="STANDARD"
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
