import { useState } from 'react';
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Upload,
  Typography,
  message,
} from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api } from '@foodiebus/api-client';
import { extractError } from '@foodiebus/api-client';
import { formatMoney } from '@foodiebus/ui';
import { http } from '../api.js';
import { useAuth } from '@foodiebus/auth';

const api = new Api(http);

export function MenuPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string } | null>(null);
  const [form] = Form.useForm();

  const { data: profile } = useQuery({
    queryKey: ['vendor-profile'],
    queryFn: () => api.getVendorProfile(),
    enabled: !!user,
  });

  const vendorId = profile?.id;

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.listCategories(),
  });

  const { data: dishes, isLoading } = useQuery({
    queryKey: ['vendor-dishes', vendorId],
    queryFn: () => api.listDishes(vendorId!, { limit: 100 }),
    enabled: !!vendorId,
  });

  const saveDish = useMutation({
    mutationFn: (values: {
      categoryId: string;
      name: string;
      description?: string;
      price: number;
      imageUrl?: string;
      sortOrder?: number;
    }) => (editing ? api.updateDish(editing.id, values) : api.createDish(values)),
    onSuccess: () => {
      message.success('Dish saved');
      setModalOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['vendor-dishes'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const toggleAvailability = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      api.setDishAvailability(id, { isAvailable }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendor-dishes'] }),
  });

  const deleteDish = useMutation({
    mutationFn: (id: string) => api.deleteDish(id),
    onSuccess: () => {
      message.success('Dish deleted');
      queryClient.invalidateQueries({ queryKey: ['vendor-dishes'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await http.post('/uploads?category=dish-images', fd);
      return res.data as { url: string };
    },
    onSuccess: (res) => form.setFieldValue('imageUrl', res.url),
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (dish: {
    id: string;
    name: string;
    description?: string;
    price: string;
    categoryId?: string;
    imageUrl?: string;
  }) => {
    setEditing({ id: dish.id });
    form.setFieldsValue({
      name: dish.name,
      description: dish.description,
      price: Number(dish.price),
      categoryId: dish.categoryId,
      imageUrl: dish.imageUrl,
    });
    setModalOpen(true);
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Category', dataIndex: ['category', 'name'], key: 'category' },
    { title: 'Price', dataIndex: 'price', key: 'price', render: (v: string) => formatMoney(v) },
    {
      title: 'Available',
      dataIndex: 'isAvailable',
      key: 'isAvailable',
      render: (v: boolean, record: { id: string }) => (
        <Switch
          checked={v}
          onChange={(checked) => toggleAvailability.mutate({ id: record.id, isAvailable: checked })}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (
        _: unknown,
        record: {
          id: string;
          name: string;
          description?: string;
          price: string;
          categoryId?: string;
          imageUrl?: string;
        },
      ) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>
            Edit
          </Button>
          <Popconfirm title="Delete this dish?" onConfirm={() => deleteDish.mutate(record.id)}>
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
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Menu Management
          </Typography.Title>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New dish
          </Button>
        </Col>
      </Row>
      <Card>
        <Table rowKey="id" columns={columns} dataSource={dishes?.items ?? []} loading={isLoading} />
      </Card>

      <Modal
        title={editing ? 'Edit dish' : 'New dish'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveDish.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveDish.mutate(v)}>
          <Form.Item
            name="categoryId"
            label="Category"
            rules={[{ required: true, message: 'Category required' }]}
          >
            <Select
              options={(categories?.items ?? []).map((c) => ({ label: c.name, value: c.id }))}
              placeholder="Select category"
            />
          </Form.Item>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Name required' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} maxLength={1000} />
          </Form.Item>
          <Form.Item
            name="price"
            label="Price (MWK)"
            rules={[{ required: true, message: 'Price required' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="imageUrl" label="Image URL" hidden>
            <Input />
          </Form.Item>
          <Form.Item label="Image">
            <Upload
              beforeUpload={(file) => {
                uploadImage.mutate(file);
                return false;
              }}
              maxCount={1}
              accept="image/*"
            >
              <Button icon={<UploadOutlined />}>Upload image</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
