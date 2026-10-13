import { useState } from 'react';
import { Button, Card, Form, Input, Modal, Table, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { formatDate, EmptyState, cardStyle, PageHeader } from '@foodiebus/ui';
import { http } from '../api.js';

const api = new Api(http);

type SettingRow = {
  key: string;
  value: unknown;
  updatedAt: string;
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SettingRow | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.listSettings(),
    retry: 1,
  });

  // Backend returns a raw array; tolerate a wrapped {items} shape too so the
  // table never renders "No settings yet" right after a successful save.
  const rows = (
    Array.isArray(data) ? data : (data as unknown as { items?: SettingRow[] })?.items ?? []
  ) as SettingRow[];

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => api.upsertSetting(key, value),
    onSuccess: () => {
      message.success('Setting saved');
      setEditing(null);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err) => {
      // Keep the modal OPEN on failure (old code closed nothing but left the
      // spinner) and surface a retryable error instead of hanging.
      message.error(`${extractError(err).message} — not saved, retry`, 6);
    },
  });

  const columns = [
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      width: 220,
      ellipsis: true,
      render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
    },
    {
      title: 'Value',
      dataIndex: 'value',
      key: 'value',
      width: 420,
      ellipsis: true,
      render: (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v)),
    },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (v: string) => formatDate(v),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: SettingRow) => (
        <Button
          size="small"
          onClick={() => {
            setEditing(record);
            form.setFieldsValue({
              value:
                typeof record.value === 'object'
                  ? JSON.stringify(record.value)
                  : String(record.value),
            });
          }}
        >
          Edit
        </Button>
      ),
    },
  ];

  const onSubmit = (values: { value: string }) => {
    if (!editing) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(values.value);
    } catch {
      parsed = values.value;
    }
    save.mutate({ key: editing.key, value: parsed });
  };

  return (
    <>
      <PageHeader title="Platform Settings" subtitle="Key-value configuration" />
      {isError && (
        <Card style={{ ...cardStyle, marginBottom: 16 }}>
          <span>Couldn&apos;t load settings. </span>
          <Button size="small" onClick={() => refetch()}>
            Retry
          </Button>
        </Card>
      )}
      <Card style={cardStyle}>
        <Table
          rowKey="key"
          columns={columns}
          dataSource={rows}
          loading={isLoading || save.isPending}
          tableLayout="fixed"
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <EmptyState title="No settings yet" /> }}
        />
      </Card>
      <Modal
        title={`Edit ${editing?.key ?? ''}`}
        open={!!editing}
        onCancel={() => {
          if (save.isPending) return;
          setEditing(null);
        }}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        okButtonProps={{ disabled: save.isPending }}
        cancelButtonProps={{ disabled: save.isPending }}
      >
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item
            name="value"
            label="Value (JSON or plain text)"
            rules={[{ required: true, message: 'Value required' }]}
          >
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
