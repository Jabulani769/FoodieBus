import { useState } from 'react';
import { Button, Card, Form, Input, Modal, Table, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { formatDate } from '@foodiebus/ui';
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

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.listSettings(),
  });

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => api.upsertSetting(key, value),
    onSuccess: () => {
      message.success('Setting saved');
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const columns = [
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
    },
    {
      title: 'Value',
      dataIndex: 'value',
      key: 'value',
      render: (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v)),
    },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (v: string) => formatDate(v),
    },
    {
      title: 'Actions',
      key: 'actions',
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
      <Typography.Title level={3}>Platform Settings</Typography.Title>
      <Card>
        <Table
          rowKey="key"
          columns={columns}
          dataSource={(data ?? []) as SettingRow[]}
          loading={isLoading}
        />
      </Card>
      <Modal
        title={`Edit ${editing?.key ?? ''}`}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item name="value" label="Value (JSON or plain text)">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
