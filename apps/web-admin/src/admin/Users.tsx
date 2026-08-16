import { useState } from 'react';
import {
  Button,
  Card,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { formatDate } from '@foodiebus/ui';
import { http } from '../api.js';

const api = new Api(http);

const ROLES = ['STUDENT', 'VENDOR', 'OPERATOR', 'DRIVER', 'FINANCIAL', 'ADMIN', 'SUPER_ADMIN'];

type UserRow = {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
};

export function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ['users', search, role],
    queryFn: () => api.listUsers({ limit: 100, search: search || undefined, role }),
  });

  const toggleStatus = useMutation({
    mutationFn: (id: string) => api.toggleUserStatus(id),
    onSuccess: () => {
      message.success('User status updated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => {
      message.success('User deleted');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const columns = [
    { title: 'Name', dataIndex: 'fullName', key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone', render: (v: string | null) => v ?? '—' },
    { title: 'Role', dataIndex: 'role', key: 'role', render: (v: string) => <Tag>{v}</Tag> },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag>,
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => formatDate(v),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: UserRow) => (
        <Space>
          <Button size="small" onClick={() => toggleStatus.mutate(record.id)}>
            {record.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Popconfirm title="Delete this user?" onConfirm={() => deleteUser.mutate(record.id)}>
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
      <Typography.Title level={3}>Users</Typography.Title>
      <Card
        title={
          <Space>
            <Input.Search
              placeholder="Search by name, email, phone"
              allowClear
              onSearch={setSearch}
              style={{ width: 260 }}
            />
            <Select
              allowClear
              placeholder="Filter by role"
              style={{ width: 180 }}
              value={role}
              onChange={setRole}
              options={ROLES.map((r) => ({ label: r, value: r }))}
            />
          </Space>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={data?.items ?? []} loading={isLoading} />
      </Card>
    </>
  );
}
