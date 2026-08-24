import { useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Modal, Select, Table, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import {
  formatMoney,
  formatDate,
  StatusBadge,
  EmptyState,
  cardStyle,
  PageHeader,
} from '@foodiebus/ui';
import { http } from '../api.js';
import type { Refund, RefundStatus } from '@foodiebus/types';

const api = new Api(http);

export function RefundsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<RefundStatus | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['refunds', statusFilter],
    queryFn: () => api.listRefunds({ limit: 100, status: statusFilter }),
  });

  const createRefund = useMutation({
    mutationFn: (values: { paymentId: string; amount: number; reason: string }) =>
      api.createRefund(values),
    onSuccess: () => {
      message.success('Refund requested');
      setCreateOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['refunds'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.approveRefund(id),
    onSuccess: () => {
      message.success('Refund approved');
      queryClient.invalidateQueries({ queryKey: ['refunds'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const reject = useMutation({
    mutationFn: (id: string) => api.rejectRefund(id, 'Rejected by finance'),
    onSuccess: () => {
      message.success('Refund rejected');
      queryClient.invalidateQueries({ queryKey: ['refunds'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const process = useMutation({
    mutationFn: (id: string) => api.processRefund(id),
    onSuccess: () => {
      message.success('Refund processed');
      queryClient.invalidateQueries({ queryKey: ['refunds'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const columns = [
    { title: 'Ref', dataIndex: ['payment', 'txRef'], key: 'txRef' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v: string) => formatMoney(v) },
    { title: 'Reason', dataIndex: 'reason', key: 'reason' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <StatusBadge status={v} />,
    },
    {
      title: 'Requested',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => formatDate(v),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: Refund) => (
        <span>
          {record.status === 'REQUESTED' && (
            <>
              <Button size="small" type="primary" onClick={() => approve.mutate(record.id)}>
                Approve
              </Button>{' '}
              <Button size="small" danger onClick={() => reject.mutate(record.id)}>
                Reject
              </Button>
            </>
          )}
          {record.status === 'APPROVED' && (
            <Button size="small" type="primary" onClick={() => process.mutate(record.id)}>
              Process
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Refunds" subtitle="Track and process customer refunds" />
      <Card
        style={cardStyle}
        title={
          <Select
            allowClear
            placeholder="Filter by status"
            style={{ width: 180 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={['REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSED', 'FAILED'].map((s) => ({
              label: s,
              value: s,
            }))}
          />
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            New refund
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={isLoading}
          locale={{ emptyText: <EmptyState title="No refunds found" /> }}
        />
      </Card>
      <Modal
        title="Request refund"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createRefund.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => createRefund.mutate(v)}>
          <Form.Item
            name="paymentId"
            label="Payment ID"
            rules={[{ required: true, message: 'Payment ID required' }]}
          >
            <Input placeholder="Payment UUID" />
          </Form.Item>
          <Form.Item
            name="amount"
            label="Amount (MWK)"
            rules={[{ required: true, message: 'Amount required' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="reason"
            label="Reason"
            rules={[{ required: true, message: 'Reason required' }]}
          >
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
