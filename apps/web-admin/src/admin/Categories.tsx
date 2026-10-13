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
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['categories', search, showInactive],
    queryFn: () =>
      api.listCategories({
        ...(search ? { search } : {}),
        includeInactive: showInactive ? 'true' : 'false',
      }),
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

  const move = useMutation({
    mutationFn: (rows: CategoryRow[]) =>
      api.reorderCategories(
        [...rows]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((r, idx) => ({ id: r.id, sortOrder: idx })),
      ),
    onSuccess: () => {
      message.success('Order saved');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name', width: 200, ellipsis: true },
    { title: 'Slug', dataIndex: 'slug', key: 'slug', width: 160, ellipsis: true },
    {
      title: 'Sort order',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 160,
      render: (v: number, record: CategoryRow, idx: number) => (
        <Space>
          <span>{v}</span>
          <Button
            size="small"
            disabled={idx === 0}
            onClick={() => {
              const rows = [...(data?.items ?? [])] as CategoryRow[];
              const i = rows.findIndex((r) => r.id === record.id);
              if (i > 0) {
                const prev = rows[i - 1]!;
                rows[i - 1] = record;
                rows[i] = prev;
                move.mutate(rows);
              }
            }}
          >
            ↑
          </Button>
          <Button
            size="small"
            disabled={idx === ((data?.items ?? []).length - 1)}
            onClick={() => {
              const rows = [...(data?.items ?? [])] as CategoryRow[];
              const i = rows.findIndex((r) => r.id === record.id);
              if (i < rows.length - 1) {
                const next = rows[i + 1]!;
                rows[i + 1] = record;
                rows[i] = next;
                move.mutate(rows);
              }
            }}
          >
            ↓
          </Button>
        </Space>
      ),
    },
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
        <Space style={{ marginBottom: 12 }}>
          <Input.Search
            placeholder="Search categories"
            allowClear
            style={{ width: 240 }}
            onSearch={(v) => setSearch(v)}
          />
          <span>
            Show inactive <Switch checked={showInactive} onChange={setShowInactive} />
          </span>
        </Space>
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
