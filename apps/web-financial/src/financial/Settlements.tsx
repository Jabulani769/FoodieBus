import { useState } from 'react';
import { Button, Card, DatePicker, Form, Modal, Table, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { formatMoney, StatusBadge, EmptyState, cardStyle, PageHeader } from '@foodiebus/ui';
import { http } from '../api.js';
import type { Settlement } from '@foodiebus/types';

const api = new Api(http);

export function SettlementsPage() {
  const queryClient = useQueryClient();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['settlements'],
    queryFn: () => api.listSettlements({ limit: 100 }),
  });

  const generate = useMutation({
    mutationFn: (period: string) => api.generateSettlements(period),
    onSuccess: () => {
      message.success('Settlements generated');
      setGenerateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const pay = useMutation({
    mutationFn: (id: string) => api.paySettlement(id),
    onSuccess: () => {
      message.success('Settlement marked paid');
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const columns = [
    { title: 'Period', dataIndex: 'period', key: 'period' },
    {
      title: 'Recipient',
      key: 'recipient',
      render: (_: unknown, r: Settlement) =>
        r.operator?.businessName ?? r.vendor?.businessName ?? '—',
    },
    {
      title: 'Gross',
      dataIndex: 'grossAmount',
      key: 'gross',
      render: (v: string) => formatMoney(v),
    },
    {
      title: 'Commission',
      dataIndex: 'commissionAmount',
      key: 'commission',
      render: (v: string) => formatMoney(v),
    },
    { title: 'Net', dataIndex: 'netAmount', key: 'net', render: (v: string) => formatMoney(v) },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <StatusBadge status={v} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: Settlement) =>
        record.status === 'PENDING' && (
          <Button size="small" type="primary" onClick={() => pay.mutate(record.id)}>
            Mark paid
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Settlements" subtitle="Operator and vendor settlement statements" />
      <Card
        style={cardStyle}
        extra={
          <Button type="primary" onClick={() => setGenerateOpen(true)}>
            Generate for period
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={isLoading}
          locale={{ emptyText: <EmptyState title="No settlements yet" /> }}
        />
      </Card>
      <Modal
        title="Generate settlements"
        open={generateOpen}
        onCancel={() => setGenerateOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={generate.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => generate.mutate(v.period.format('YYYY-MM'))}
        >
          <Form.Item
            name="period"
            label="Period (month)"
            rules={[{ required: true, message: 'Period required' }]}
          >
            <DatePicker picker="month" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
