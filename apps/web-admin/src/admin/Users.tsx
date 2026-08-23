import { useState } from 'react';
import { Button, Card, Input, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { EmptyState, formatDate, PageHeader } from '@foodiebus/ui';
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
    { title: 'Name', dataIndex: 'fullName', key: 'name', width: 160, ellipsis: true },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 230,
      ellipsis: true,
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
      ellipsis: true,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 110,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 95,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag>,
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (v: string) => formatDate(v),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 170,
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
      <PageHeader title="Users" subtitle="Manage platform accounts and roles" />
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
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={isLoading}
          tableLayout="fixed"
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: (
              <EmptyState
                title="No users found"
                description="Try adjusting the search or role filter."
              />
            ),
          }}
        />
      </Card>
    </>
  );
}
