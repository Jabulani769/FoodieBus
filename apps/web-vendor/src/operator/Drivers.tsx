import { useState } from 'react';
import { Button, Card, Form, Input, Modal, Popconfirm, Table, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api } from '@foodiebus/api-client';
import { extractError } from '@foodiebus/api-client';
import { http } from '../api.js';

import { EmptyState, PageHeader } from '@foodiebus/ui';

const api = new Api(http);

export function DriversPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const { data: drivers, isLoading } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.listDrivers(),
  });

  const createDriver = useMutation({
    mutationFn: (values: {
      fullName: string;
      phone: string;
      email: string;
      password: string;
      licenseNumber?: string;
    }) => api.createDriver(values),
    onSuccess: () => {
      message.success('Driver registered');
      setModalOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.deactivateDriver(id),
    onSuccess: () => {
      message.success('Driver deactivated');
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const columns = [
    { title: 'Name', dataIndex: ['user', 'fullName'], key: 'name' },
    { title: 'Email', dataIndex: ['user', 'email'], key: 'email' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone' },
    {
      title: 'License',
      dataIndex: 'licenseNumber',
      key: 'license',
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (v: boolean) => (v ? 'Yes' : 'No'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: { id: string; isActive: boolean }) =>
        record.isActive ? (
          <Popconfirm
            title="Deactivate this driver?"
            onConfirm={() => deactivate.mutate(record.id)}
          >
            <Button size="small" danger>
              Deactivate
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader title="Drivers" />
      <Card
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Register driver
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={drivers?.items ?? []}
          loading={isLoading}
          locale={{ emptyText: <EmptyState title="No drivers yet" /> }}
        />
      </Card>
      <Modal
        title="Register driver"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createDriver.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => {
            const cleaned = Object.fromEntries(
              Object.entries(v).filter(([, val]) => val !== ''),
            ) as {
              fullName: string;
              phone: string;
              email: string;
              password: string;
              licenseNumber?: string;
            };
            createDriver.mutate(cleaned);
          }}
        >
          <Form.Item
            name="fullName"
            label="Full name"
            rules={[{ required: true, message: 'Name required' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="phone"
            label="Phone"
            rules={[{ required: true, message: 'Phone required' }]}
          >
            <Input placeholder="+265..." />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="licenseNumber" label="License number">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
