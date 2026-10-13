import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Collapse,
  Descriptions,
  Divider,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Upload,
  message,
} from 'antd';
import { CheckCircleOutlined, PictureOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api } from '@foodiebus/api-client';
import { extractError } from '@foodiebus/api-client';
import { colors, formatMoney, EmptyState, cardStyle, PageHeader } from '@foodiebus/ui';
import { http } from '../api.js';
import { useAuth } from '@foodiebus/auth';

const api = new Api(http);

type OptionRow = {
  id: string;
  label: string;
  priceDelta: string;
  isActive: boolean;
};

type GroupRow = {
  id: string;
  name: string;
  type: 'SINGLE' | 'MULTI';
  isRequired: boolean;
  options: OptionRow[];
};

type DishRow = {
  id: string;
  name: string;
  description?: string;
  price: string;
  imageUrl?: string;
  isAvailable: boolean;
  badge?: string | null;
  locked?: boolean;
  category?: { id?: string; name?: string };
  categoryId?: string;
  rating?: { average: number; count: number };
  optionGroups?: GroupRow[];
};

export function MenuPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string } | null>(null);
  const [viewing, setViewing] = useState<DishRow | null>(null);
  const [customizing, setCustomizing] = useState<DishRow | null>(null);
  const [categorySearch, setCategorySearch] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [previewSelection, setPreviewSelection] = useState<Record<string, string[]>>({});
  const [form] = Form.useForm();
  const [groupForm] = Form.useForm();
  // Freshly-uploaded dish image filename — persistent "uploaded ✓" proof in
  // the dish modal (the imageUrl field itself is hidden). Cleared whenever the
  // modal opens for a different dish.
  const [dishImageName, setDishImageName] = useState<string | null>(null);
  const [optionForms, setOptionForms] = useState<Record<string, { label: string; priceDelta: number }>>({});

  const { data: profile } = useQuery({
    queryKey: ['vendor-profile'],
    queryFn: () => api.getVendorProfile(),
    enabled: !!user,
  });

  const vendorId = profile?.id;

  const { data: categories } = useQuery({
    queryKey: ['categories', categorySearch],
    queryFn: () =>
      api.listCategories(categorySearch ? { search: categorySearch } : undefined),
  });

  const { data: dishes, isLoading } = useQuery({
    queryKey: ['vendor-dishes', vendorId],
    queryFn: () => api.listDishes(vendorId!, { limit: 100 }),
    enabled: !!vendorId,
  });

  // Grouped hierarchy view (category headers in owner sort order) — the
  // restaurant-standard menu structure. Reuses the customer-facing
  // menu-grouped endpoint so vendor sees exactly what customers see.
  const { data: grouped } = useQuery({
    queryKey: ['vendor-menu-grouped', vendorId],
    queryFn: () => api.getVendorMenuGrouped(vendorId!),
    enabled: !!vendorId,
  });

  const moveDish = useMutation({
    mutationFn: ({ dishId, categoryId }: { dishId: string; categoryId: string }) =>
      api.updateDish(dishId, { categoryId }),
    onSuccess: () => {
      message.success('Dish moved to category');
      queryClient.invalidateQueries({ queryKey: ['vendor-dishes'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-menu-grouped'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const { data: dishDetail } = useQuery({
    queryKey: ['dish-detail', customizing?.id],
    queryFn: () => api.getDish(customizing!.id),
    enabled: !!customizing?.id,
  });

  const detail = (dishDetail ?? customizing ?? viewing) as DishRow | undefined;

  const previewTotal = useMemo(() => {
    if (!detail) return 0;
    const base = Number(detail.price ?? 0);
    let delta = 0;
    for (const g of detail.optionGroups ?? []) {
      const picked = previewSelection[g.id] ?? [];
      for (const oid of picked) {
        const opt = g.options.find((o) => o.id === oid);
        if (opt) delta += Number(opt.priceDelta ?? 0);
      }
    }
    return base + delta;
  }, [detail, previewSelection]);

  const saveDish = useMutation({
    mutationFn: (values: {
      categoryId: string;
      name: string;
      description?: string;
      price: number;
      imageUrl?: string;
      sortOrder?: number;
    }) => (editing ? api.updateDish(editing.id, values) : api.createDish(values)),
    onSuccess: (res) => {
      message.success('Dish saved — now add required/optional customizations');
      setModalOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['vendor-dishes'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-menu-grouped'] });
      if (!editing && (res as { id: string })?.id) {
        setPreviewSelection({});
        setCustomizing({ id: (res as { id: string }).id } as DishRow);
      }
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const createCategory = useMutation({
    mutationFn: (name: string) => api.findOrCreateCategory(name),
    onSuccess: (res: { id: string; created: boolean }) => {
      message.success(res.created ? 'Category created' : 'Category found');
      setNewCategoryName('');
      setCategorySearch('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      if (res.id) form.setFieldValue('categoryId', res.id);
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const toggleAvailability = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      api.setDishAvailability(id, { isAvailable }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-dishes'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-menu-grouped'] });
      queryClient.invalidateQueries({ queryKey: ['dish-detail'] });
    },
  });

  const deleteDish = useMutation({
    mutationFn: (id: string) => api.deleteDish(id),
    onSuccess: () => {
      message.success('Dish deleted');
      queryClient.invalidateQueries({ queryKey: ['vendor-dishes'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-menu-grouped'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const createGroup = useMutation({
    mutationFn: (values: { name: string; type: 'SINGLE' | 'MULTI'; isRequired: boolean }) =>
      api.createOptionGroup(customizing!.id, {
        name: values.name,
        type: values.type,
        isRequired: values.isRequired,
        minSelect: values.isRequired && values.type === 'SINGLE' ? 1 : 0,
        maxSelect: values.type === 'SINGLE' ? 1 : null,
      }),
    onSuccess: () => {
      message.success('Customization group added');
      groupForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['dish-detail'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-dishes'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const createOption = useMutation({
    mutationFn: ({ groupId, label, priceDelta }: { groupId: string; label: string; priceDelta: number }) =>
      api.createOption(customizing!.id, groupId, { label, priceDelta }),
    onSuccess: (_res, vars) => {
      setOptionForms((p) => ({ ...p, [vars.groupId]: { label: '', priceDelta: 0 } }));
      queryClient.invalidateQueries({ queryKey: ['dish-detail'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-dishes'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const deleteGroup = useMutation({
    mutationFn: (groupId: string) => api.deleteOptionGroup(customizing!.id, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dish-detail'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-dishes'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const deleteOption = useMutation({
    mutationFn: ({ groupId, optionId }: { groupId: string; optionId: string }) =>
      api.deleteOption(customizing!.id, groupId, optionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dish-detail'] });
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
    onSuccess: (res, file) => {
      form.setFieldValue('imageUrl', res.url);
      setDishImageName(file.name);
      message.success('Dish image uploaded ✓ — save the dish to apply');
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const openCreate = () => {
    setEditing(null);
    setDishImageName(null);
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
    setDishImageName(null);
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
    {
      title: 'Image',
      dataIndex: 'imageUrl',
      key: 'imageUrl',
      width: 72,
      render: (url: string) =>
        url ? (
          <Image
            src={url}
            width={48}
            height={48}
            preview={false}
            style={{ objectFit: 'cover', borderRadius: 8 }}
          />
        ) : (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              background: colors.bg.app,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colors.text.tertiary,
            }}
          >
            <PictureOutlined />
          </div>
        ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: DishRow) => (
        <Space direction="vertical" size={2}>
          <Button
            type="link"
            style={{ padding: 0, height: 'auto' }}
            onClick={() => setViewing(record)}
          >
            {name}
          </Button>
          {!record.isAvailable && <Tag color="red">Unavailable Today</Tag>}
          {(record.optionGroups?.length ?? 0) > 0 && (
            <Tag color="blue">{record.optionGroups!.length} customization group(s)</Tag>
          )}
        </Space>
      ),
    },
    { title: 'Category', dataIndex: ['category', 'name'], key: 'category' },
    { title: 'Price', dataIndex: 'price', key: 'price', render: (v: string) => formatMoney(v) },
    {
      title: 'Available',
      dataIndex: 'isAvailable',
      key: 'isAvailable',
      render: (v: boolean, record: DishRow) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={v}
            onChange={(checked) =>
              toggleAvailability.mutate({ id: record.id, isAvailable: checked })
            }
          />
        </span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: DishRow) => (
        <Space onClick={(e) => e.stopPropagation()}>
          <Button size="small" onClick={() => openEdit(record)}>
            Edit
          </Button>
          <Button
            size="small"
            onClick={() => {
              setPreviewSelection({});
              setCustomizing(record);
            }}
          >
            Customize
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
      <PageHeader
        title="Menu Management"
        subtitle="Manage dishes, required choices (radio) and optional add-ons (checkbox) — click a dish to view its details"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New dish
          </Button>
        }
      />
      {/* Category hierarchy — collapsible sections exactly as customers see them */}
      <Card style={{ ...cardStyle, marginBottom: 16 }} title="Menu by category">
        <Collapse
          defaultActiveKey={(grouped?.groups ?? []).map((_g, i) => String(i)).slice(0, 3)}
          items={(grouped?.groups ?? []).map((g: { id?: string; name?: string; items?: DishRow[] }, i: number) => ({
            key: String(i),
            label: (
              <Space>
                <strong>{g.name ?? `Category ${i + 1}`}</strong>
                <Tag color={(g.items?.length ?? 0) === 0 ? 'orange' : 'blue'}>
                  {(g.items?.length ?? 0) === 0 ? 'Empty' : `${g.items!.length} dish(es)`}
                </Tag>
              </Space>
            ),
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {(g.items ?? []).map((d) => (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '6px 0',
                      borderBottom: `1px solid ${colors.border}`,
                    }}
                  >
                    <span>
                      <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => setViewing(d)}>
                        {d.name}
                      </Button>{' '}
                      <span style={{ color: colors.text.secondary, fontSize: 12 }}>
                        {formatMoney(d.price)}
                      </span>{' '}
                      {!d.isAvailable && <Tag color="red">Unavailable</Tag>}
                    </span>
                    <Select
                      size="small"
                      style={{ minWidth: 160 }}
                      placeholder="Move to…"
                      value={d.categoryId ?? d.category?.id}
                      options={(categories?.items ?? []).map((c) => ({ label: c.name, value: c.id }))}
                      onChange={(categoryId) => {
                        if (categoryId && categoryId !== (d.categoryId ?? d.category?.id)) {
                          moveDish.mutate({ dishId: d.id, categoryId });
                        }
                      }}
                    />
                  </div>
                ))}
                {(g.items?.length ?? 0) === 0 && (
                  <span style={{ color: colors.text.tertiary, fontSize: 13 }}>
                    No dishes here yet — use “Move to…” on a dish below, or create a dish in this
                    category. Empty sections are hidden from customers.
                  </span>
                )}
              </Space>
            ),
          }))}
        />
      </Card>
      <Card style={cardStyle}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={dishes?.items ?? []}
          loading={isLoading}
          onRow={(record) => ({ onClick: () => setViewing(record as DishRow) })}
          locale={{ emptyText: <EmptyState title="No dishes yet" /> }}
        />
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
              showSearch
              filterOption={false}
              onSearch={setCategorySearch}
              options={(categories?.items ?? []).map((c) => ({ label: c.name, value: c.id }))}
              placeholder="Search or select category"
              dropdownRender={(menu) => (
                <>
                  {menu}
                  <Divider style={{ margin: '8px 0' }} />
                  <Space style={{ padding: '0 8px 4px', width: '100%' }}>
                    <Input
                      placeholder="New category name"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                    <Button
                      type="text"
                      icon={<PlusOutlined />}
                      loading={createCategory.isPending}
                      disabled={!newCategoryName.trim()}
                      onClick={() => createCategory.mutate(newCategoryName.trim())}
                    >
                      Create
                    </Button>
                  </Space>
                </>
              )}
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
              // Controlled-empty: we upload via react-query, so antd must not
              // keep the picked file in a forever-'uploading' chip.
              fileList={[]}
              maxCount={1}
              accept="image/*"
            >
              <Button icon={<UploadOutlined />} loading={uploadImage.isPending}>Upload image</Button>
            </Upload>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.imageUrl !== b.imageUrl}>
            {({ getFieldValue }) =>
              getFieldValue('imageUrl') ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Image
                    src={getFieldValue('imageUrl')}
                    style={{ borderRadius: 12, maxHeight: 160, width: '100%', objectFit: 'cover' }}
                    fallback="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                  />
                  {dishImageName && (
                    <Tag color="green" icon={<CheckCircleOutlined />}>
                      Uploaded ✓ {dishImageName}
                    </Tag>
                  )}
                </Space>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={viewing?.name}
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={[
          <Button key="close" onClick={() => setViewing(null)}>
            Close
          </Button>,
          <Button
            key="customize"
            onClick={() => {
              const current = viewing;
              setViewing(null);
              if (current) {
                setPreviewSelection({});
                setCustomizing(current);
              }
            }}
          >
            Customize
          </Button>,
          <Button
            key="edit"
            type="primary"
            onClick={() => {
              const current = viewing;
              setViewing(null);
              if (current) openEdit(current);
            }}
          >
            Edit
          </Button>,
        ]}
      >
        {viewing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {viewing.imageUrl ? (
              <Image
                src={viewing.imageUrl}
                style={{ borderRadius: 12, maxHeight: 260, width: '100%', objectFit: 'cover' }}
                fallback="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
              />
            ) : (
              <div
                style={{
                  height: 180,
                  borderRadius: 12,
                  background: colors.bg.app,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: colors.text.tertiary,
                  fontSize: 32,
                }}
              >
                <PictureOutlined />
              </div>
            )}
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Category">
                {viewing.category?.name ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Price">{formatMoney(viewing.price)}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={viewing.isAvailable ? 'green' : 'red'}>
                  {viewing.isAvailable ? 'Available' : 'Unavailable Today'}
                </Tag>
              </Descriptions.Item>
              {viewing.rating && (
                <Descriptions.Item label="Rating">
                  {viewing.rating.average.toFixed(1)} ({viewing.rating.count})
                </Descriptions.Item>
              )}
            </Descriptions>
            <div style={{ color: colors.text.secondary, fontSize: 14, whiteSpace: 'pre-wrap' }}>
              {viewing.description || 'No description provided.'}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title={`Customize — ${(dishDetail as DishRow)?.name ?? customizing?.name ?? ''}`}
        open={!!customizing}
        onCancel={() => setCustomizing(null)}
        footer={[
          <Button key="close" onClick={() => setCustomizing(null)}>
            Done
          </Button>,
        ]}
        width={640}
      >
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: colors.text.secondary }}>
              Base {formatMoney(detail.price)} • Preview total{' '}
              <strong>{formatMoney(String(previewTotal))}</strong> — customers must settle
              required choices before Add to Cart.
            </div>
            {(detail.optionGroups ?? []).map((g) => (
              <Card key={g.id} size="small" title={`${g.name} ${g.isRequired ? '(required)' : '(optional)'}`} extra={
                <Popconfirm title="Delete group?" onConfirm={() => deleteGroup.mutate(g.id)}>
                  <Button size="small" danger>Delete</Button>
                </Popconfirm>
              }>
                <div style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 8 }}>
                  {g.type === 'SINGLE' ? 'Radio — pick exactly one' : 'Checkbox — pick any'} •{' '}
                  {g.options.length} option(s)
                </div>
                {g.type === 'SINGLE' ? (
                  <Radio.Group
                    value={(previewSelection[g.id] ?? [])[0]}
                    onChange={(e) => setPreviewSelection((p) => ({ ...p, [g.id]: [e.target.value] }))}
                  >
                    <Space direction="vertical">
                      {g.options.map((o) => (
                        <Radio key={o.id} value={o.id}>
                          {o.label} {Number(o.priceDelta) > 0 ? `(+${formatMoney(o.priceDelta)})` : ''}
                        </Radio>
                      ))}
                    </Space>
                  </Radio.Group>
                ) : (
                  <Checkbox.Group
                    value={previewSelection[g.id] ?? []}
                    onChange={(vals) =>
                      setPreviewSelection((p) => ({ ...p, [g.id]: vals as string[] }))
                    }
                  >
                    <Space direction="vertical">
                      {g.options.map((o) => (
                        <Checkbox key={o.id} value={o.id}>
                          {o.label} {Number(o.priceDelta) > 0 ? `(+${formatMoney(o.priceDelta)})` : ''}
                        </Checkbox>
                      ))}
                    </Space>
                  </Checkbox.Group>
                )}
                <Divider style={{ margin: '12px 0' }} />
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    placeholder="Option label e.g. Double"
                    value={optionForms[g.id]?.label ?? ''}
                    onChange={(e) =>
                      setOptionForms((p) => ({
                        ...p,
                        [g.id]: { label: e.target.value, priceDelta: p[g.id]?.priceDelta ?? 0 },
                      }))
                    }
                  />
                  <InputNumber
                    min={0}
                    placeholder="+MWK"
                    value={optionForms[g.id]?.priceDelta ?? 0}
                    onChange={(v) =>
                      setOptionForms((p) => ({
                        ...p,
                        [g.id]: { label: p[g.id]?.label ?? '', priceDelta: Number(v ?? 0) },
                      }))
                    }
                  />
                  <Button
                    type="primary"
                    loading={createOption.isPending}
                    disabled={!(optionForms[g.id]?.label ?? '').trim()}
                    onClick={() =>
                      createOption.mutate({
                        groupId: g.id,
                        label: (optionForms[g.id]?.label ?? '').trim(),
                        priceDelta: optionForms[g.id]?.priceDelta ?? 0,
                      })
                    }
                  >
                    Add
                  </Button>
                </Space.Compact>
                <div style={{ marginTop: 8 }}>
                  {g.options.map((o) => (
                    <Tag
                      key={o.id}
                      closable
                      onClose={() => deleteOption.mutate({ groupId: g.id, optionId: o.id })}
                      style={{ marginBottom: 4 }}
                    >
                      {o.label}
                    </Tag>
                  ))}
                </div>
              </Card>
            ))}
            <Divider>Add required / optional group</Divider>
            <Form
              form={groupForm}
              layout="inline"
              onFinish={(v) => createGroup.mutate(v)}
              style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
            >
              <Form.Item name="name" rules={[{ required: true, message: 'Name required' }]}>
                <Input placeholder="e.g. Choice of Patty" style={{ width: 200 }} />
              </Form.Item>
              <Form.Item name="type" initialValue="SINGLE">
                <Select options={[{ label: 'Required single (radio)', value: 'SINGLE' }, { label: 'Optional multi (checkbox)', value: 'MULTI' }]} style={{ width: 220 }} />
              </Form.Item>
              <Form.Item name="isRequired" valuePropName="checked" initialValue={false}>
                <Checkbox>Required</Checkbox>
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={createGroup.isPending}>
                  Add group
                </Button>
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>
    </>
  );
}
