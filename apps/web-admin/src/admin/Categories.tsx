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
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { EmptyState, PageHeader, cardStyle } from '@foodiebus/ui';
import { http } from '../api.js';

const api = new Api(http);

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
};

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.listCategories(),
  });

  const save = useMutation({
    mutationFn: (values: { name: string; slug: string; sortOrder?: number }) =>
      editing ? api.updateCategory(editing.id, values) : api.createCategory(values),
    onSuccess: () => {
      message.success('Category saved');
      setModalOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => api.deleteCategory(id),
    onSuccess: () => {
      message.success('Category deleted');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const toggle = useMutation({
    mutationFn: (row: CategoryRow) => api.updateCategory(row.id, { isActive: !row.isActive }),
    onSuccess: () => {
      message.success('Category updated');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name', width: 200, ellipsis: true },
    { title: 'Slug', dataIndex: 'slug', key: 'slug', width: 160, ellipsis: true },
    { title: 'Sort order', dataIndex: 'sortOrder', key: 'sortOrder', width: 120 },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (v: boolean, record: CategoryRow) => (
        <Switch checked={v} onChange={() => toggle.mutate(record)} />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_: unknown, record: CategoryRow) => (
        <Space>
          <Button
            size="small"
            onClick={() => {
              setEditing(record);
              form.setFieldsValue({
                name: record.name,
                slug: record.slug,
                sortOrder: record.sortOrder,
              });
              setModalOpen(true);
            }}
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete this category?"
            onConfirm={() => deleteCategory.mutate(record.id)}
          >
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
      <PageHeader title="Categories" subtitle="Food menu categories" />
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
            New category
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={isLoading}
          tableLayout="fixed"
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <EmptyState title="No categories yet" /> }}
        />
      </Card>
      <Modal
        title={editing ? 'Edit category' : 'New category'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Name required' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="slug"
            label="Slug"
            rules={[{ required: true, message: 'Slug required' }]}
          >
            <Input placeholder="e.g. hot-meals" />
          </Form.Item>
          <Form.Item name="sortOrder" label="Sort order">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
