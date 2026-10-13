import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Upload,
  message,
} from 'antd';
import { CheckCircleOutlined, FireOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import type { ActivePromotion, Promotion } from '@foodiebus/types';
import { colors, formatMoney, EmptyState, cardStyle, PageHeader } from '@foodiebus/ui';
import { http } from '../api.js';
import { launchPaychanguInline } from '../paychangu-inline.js';
import { useAuth } from '@foodiebus/auth';
import dayjs from 'dayjs';

const api = new Api(http);

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'green',
  SCHEDULED: 'blue',
  PENDING_PAYMENT: 'orange',
  EXPIRED: 'default',
  CANCELLED: 'red',
};

export function PromotionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  // Freshly-uploaded promo image filename — persistent "uploaded ✓" proof in
  // the promo modal (the imageUrl field itself is hidden). Cleared whenever
  // the modal opens.
  const [promoImageName, setPromoImageName] = useState<string | null>(null);
  const [preview, setPreview] = useState<(Promotion & { dish?: { name?: string } }) | ActivePromotion | null>(null);
  const [form] = Form.useForm();
  const watchedDish = Form.useWatch('dishId', form);
  const watchedDays = Form.useWatch('days', form);

  const { data: profile } = useQuery({
    queryKey: ['vendor-profile'],
    queryFn: () => api.getVendorProfile(),
    enabled: !!user,
  });
  const vendorId = profile?.id;

  const { data: dishes } = useQuery({
    queryKey: ['vendor-dishes', vendorId],
    queryFn: () => api.listDishes(vendorId!, { limit: 100 }),
    enabled: !!vendorId,
  });

  const { data: promos, isLoading } = useQuery({
    queryKey: ['my-promotions'],
    queryFn: () => api.listMyPromotions(),
    enabled: !!user,
  });

  const { data: quote } = useQuery({
    queryKey: ['promo-quote', watchedDish, watchedDays],
    queryFn: () => api.quotePromotion({ dishId: watchedDish, days: watchedDays }),
    enabled: !!watchedDish && Number(watchedDays) >= 1,
  });

  const createPromo = useMutation({
    mutationFn: (values: {
      dishId: string;
      headline: string;
      description?: string;
      imageUrl?: string;
      days: number;
      startsAt?: string;
    }) => api.createPromotion(values),
    onSuccess: (res) => {
      message.success(`Promotion created — pay ${formatMoney(res.amountMWK)} to go live`);
      setModalOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['my-promotions'] });
      // Immediately open the drop-in popup so the vendor pays in place.
      payPromo.mutate({ id: res.id, returnUrl: window.location.href });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const payPromo = useMutation({
    mutationFn: (vars: { id: string; returnUrl?: string }) =>
      api.payPromotion(vars.id, { returnUrl: vars.returnUrl }),
    onSuccess: async (params, vars) => {
      // Drop-in overlay on this page — no redirect, no new tab.
      try {
        await launchPaychanguInline(params);
        message.info('Complete payment in the popup — confirming automatically');
      } catch (err) {
        message.error(extractError(err).message);
        return;
      }
      void pollVerify(vars.id);
    },
    onError: (err) => message.error(extractError(err).message),
  });

  // Poll server-side verify until PayChangu confirms (webhook is the backup).
  const verifyingRef = useRef<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const pollVerify = async (id: string, attempts = 30) => {
    if (verifyingRef.current === id) return;
    verifyingRef.current = id;
    setVerifyingId(id);
    try {
      for (let i = 0; i < attempts; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        try {
          await api.verifyPromotion(id);
          message.success('Payment confirmed — promotion is live');
          queryClient.invalidateQueries({ queryKey: ['my-promotions'] });
          return;
        } catch (e) {
          const err = extractError(e);
          // PAYMENT_FAILED = gateway hasn't confirmed yet → keep polling.
          if (err.code !== 'PAYMENT_FAILED') {
            message.error(err.message);
            return;
          }
        }
      }
      message.info('Still waiting on PayChangu — hit "I’ve paid" to confirm');
    } finally {
      verifyingRef.current = null;
      setVerifyingId(null);
    }
  };

  const verifyPromo = useMutation({
    mutationFn: (id: string) => api.verifyPromotion(id),
    onSuccess: () => {
      message.success('Payment confirmed — promotion is live');
      queryClient.invalidateQueries({ queryKey: ['my-promotions'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const cancelPromo = useMutation({
    mutationFn: (id: string) => api.cancelPromotion(id),
    onSuccess: () => {
      message.success('Promotion cancelled');
      queryClient.invalidateQueries({ queryKey: ['my-promotions'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await http.post('/uploads?category=promo-images', fd);
      return res.data as { url: string };
    },
    onSuccess: (res, file) => {
      form.setFieldValue('imageUrl', res.url);
      setPromoImageName(file.name);
      message.success('Promo image uploaded ✓ — create the promotion to apply');
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const items = useMemo(() => (promos?.items ?? []) as Promotion[], [promos]);
  const active = items.filter((p) => p.status === 'ACTIVE');
  const spend = items
    .filter((p) => ['ACTIVE', 'SCHEDULED', 'EXPIRED'].includes(p.status))
    .reduce((s, p) => s + Number(p.amountMWK ?? 0), 0);

  // If PayChangu ever navigates the top window (cancel/fail → returnUrl),
  // land back here and auto-confirm the matching promotion.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const txRef = params.get('tx_ref');
    if (!txRef || !txRef.startsWith('PROMO-') || items.length === 0) return;
    const match = items.find((p) => p.txRef === txRef);
    if (match && ['PENDING_PAYMENT', 'SCHEDULED'].includes(match.status)) {
      verifyPromo.mutate(match.id);
      params.delete('tx_ref');
      params.delete('status');
      const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
      window.history.replaceState(null, '', clean);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const columns = [
    {
      title: 'Dish',
      key: 'dish',
      render: (_: unknown, r: Promotion) => (
        <Space direction="vertical" size={0}>
          <strong>{r.dish?.name ?? r.dishId.slice(0, 8)}</strong>
          <span style={{ fontSize: 12, color: colors.text.secondary }}>{r.headline}</span>
        </Space>
      ),
    },
    {
      title: 'Validity',
      key: 'validity',
      render: (_: unknown, r: Promotion) => (
        <span style={{ fontSize: 12 }}>
          {new Date(r.startsAt).toLocaleDateString()} → {new Date(r.endsAt).toLocaleDateString()}
          {typeof r.daysLeft === 'number' && r.status === 'ACTIVE' && ` (${r.daysLeft}d left)`}
        </span>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amountMWK',
      key: 'amount',
      render: (v: string) => formatMoney(v),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <Tag color={STATUS_COLOR[v] ?? 'default'}>{v.replace('_', ' ')}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, r: Promotion) => (
        <Space wrap>
          <Button size="small" onClick={() => setPreview(r)}>
            View card
          </Button>
          {r.status === 'PENDING_PAYMENT' && (
            <>
              <Button
                size="small"
                type="primary"
                loading={payPromo.isPending || verifyingId === r.id}
                onClick={() => payPromo.mutate({ id: r.id, returnUrl: window.location.href })}
              >
                {verifyingId === r.id ? 'Confirming…' : 'Pay'}
              </Button>
              <Button size="small" onClick={() => verifyPromo.mutate(r.id)} loading={verifyPromo.isPending}>
                I&apos;ve paid
              </Button>
              <Button size="small" danger onClick={() => cancelPromo.mutate(r.id)}>
                Cancel
              </Button>
            </>
          )}
          {r.status === 'SCHEDULED' && (
            <Button size="small" danger onClick={() => cancelPromo.mutate(r.id)}>
              Cancel
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Promotions"
        subtitle="Boost a dish to the app promo card — pay a flat rate per day via PayChangu"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setPromoImageName(null); form.resetFields(); setModalOpen(true); }}>
            New promotion
          </Button>
        }
      />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card style={cardStyle}>
            <Statistic title="Live promotions" value={active.length} prefix={<FireOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={cardStyle}>
            <Statistic title="Total promotions" value={items.length} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={cardStyle}>
            <Statistic title="Promo spend (MWK)" value={formatMoney(String(spend))} />
          </Card>
        </Col>
      </Row>
      <Card style={cardStyle}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={isLoading}
          locale={{ emptyText: <EmptyState title="No promotions yet — boost your first dish" /> }}
        />
      </Card>

      <Modal
        title="New dish promotion"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createPromo.isPending}
        okText={quote ? `Create & pay ${formatMoney(String(quote.amountMWK))}` : 'Create & pay'}
        width={560}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ days: 7 }}
          onFinish={(v) =>
            createPromo.mutate({
              ...v,
              imageUrl: v.imageUrl || undefined,
              startsAt: v.startsAt ? dayjs(v.startsAt).toISOString() : undefined,
            })
          }
        >
          <Form.Item name="dishId" label="Dish to boost" rules={[{ required: true, message: 'Pick a dish' }]}>
            <Select
              placeholder="Select an available dish"
              options={(dishes?.items ?? [])
                .filter((d) => d.isAvailable)
                .map((d) => ({ label: `${d.name} — ${formatMoney(d.price)}`, value: d.id }))}
            />
          </Form.Item>
          <Form.Item name="headline" label="Promo headline (on the card)" rules={[{ required: true, max: 80 }]}>
            <Input placeholder="e.g. Weekend double burger deal" maxLength={80} showCount />
          </Form.Item>
          <Form.Item name="description" label="Promo words (on the card)" rules={[{ max: 200 }]}>
            <Input.TextArea rows={2} maxLength={200} showCount placeholder="Short appetizing line shown under the dish" />
          </Form.Item>
          <Form.Item name="days" label="Days to display" rules={[{ required: true, type: 'number', min: 1, max: 30 }]}>
            <InputNumber min={1} max={30} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="startsAt" label="Start (empty = now)">
            <DatePicker showTime style={{ width: '100%' }} minDate={dayjs()} />
          </Form.Item>
          <Form.Item name="imageUrl" label="Promo image (defaults to dish photo)" hidden>
            <Input />
          </Form.Item>
          <Form.Item label="Promo image">
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
              <Button icon={<UploadOutlined />} loading={uploadImage.isPending}>
                Upload promo image
              </Button>
            </Upload>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.imageUrl !== b.imageUrl}>
            {({ getFieldValue }) =>
              getFieldValue('imageUrl') ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Image
                    src={getFieldValue('imageUrl')}
                    preview={false}
                    style={{ borderRadius: 12, maxHeight: 160, width: '100%', objectFit: 'cover' }}
                    fallback="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                  />
                  {promoImageName && (
                    <Tag color="green" icon={<CheckCircleOutlined />}>
                      Uploaded ✓ {promoImageName}
                    </Tag>
                  )}
                </Space>
              ) : null
            }
          </Form.Item>
          {quote && (
            <Card size="small" style={{ background: colors.bg.app }}>
              Quote: <strong>{quote.days} day(s) × {formatMoney(String(quote.dailyRate))}</strong> ={' '}
              <strong>{formatMoney(String(quote.amountMWK))} MWK</strong> via PayChangu
            </Card>
          )}
        </Form>
      </Modal>

      <Modal title="Promo card preview" open={!!preview} onCancel={() => setPreview(null)} footer={null}>
        {preview && (
          <Card
            cover={
              ((preview as Promotion).imageUrl || (preview as ActivePromotion).imageUrl) && (
                <Image
                  src={(preview as Promotion).imageUrl ?? (preview as ActivePromotion).imageUrl ?? ''}
                  preview={false}
                  style={{ height: 200, objectFit: 'cover' }}
                  fallback="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                />
              )
            }
          >
            <Space direction="vertical">
              <Tag color="red" icon={<FireOutlined />}>
                PROMOTED
              </Tag>
              <strong style={{ fontSize: 16 }}>{(preview as Promotion).headline}</strong>
              {(preview as Promotion).description && <span>{(preview as Promotion).description}</span>}
              <span style={{ fontSize: 12, color: colors.text.secondary }}>
                Valid {new Date((preview as Promotion).startsAt).toLocaleDateString()} →{' '}
                {new Date((preview as Promotion).endsAt).toLocaleDateString()}
              </span>
            </Space>
          </Card>
        )}
      </Modal>
    </>
  );
}
