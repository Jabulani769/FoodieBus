import { useEffect, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  Row,
  Skeleton,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { LockOutlined, NotificationOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { colors, PageHeader, cardStyle } from '@foodiebus/ui';
import { http } from '../api.js';
import { useAuth } from '@foodiebus/auth';

const api = new Api(http);
const { Title, Text } = Typography;

type Prefs = { sms: boolean; whatsapp: boolean; email: boolean };

export function ProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [detailsForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [prefs, setPrefs] = useState<Prefs>({ sms: true, whatsapp: true, email: true });

  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.getMe(),
  });

  const { data: preferences } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api.getNotificationPreferences(),
  });

  useEffect(() => {
    if (me) detailsForm.setFieldsValue({ fullName: me.fullName, phone: me.phone });
  }, [me, detailsForm]);

  useEffect(() => {
    if (preferences) setPrefs(preferences);
  }, [preferences]);

  const saveDetails = useMutation({
    mutationFn: (values: { fullName?: string; phone?: string }) => api.updateMe(values),
    onSuccess: () => {
      message.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const changePassword = useMutation({
    mutationFn: (values: { currentPassword: string; newPassword: string }) =>
      api.changePassword(values),
    onSuccess: () => {
      message.success('Password changed');
      passwordForm.resetFields();
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const updatePrefs = useMutation({
    mutationFn: (values: Partial<Prefs>) => api.updateNotificationPreferences(values),
    onSuccess: () => {
      message.success('Notification preferences saved');
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const displayName = me?.fullName || user?.fullName || '—';
  const initial = (displayName || 'U').charAt(0).toUpperCase();

  const onTogglePref = (key: keyof Prefs, value: boolean) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    updatePrefs.mutate({ [key]: value } as Partial<Prefs>);
  };

  return (
    <>
      <PageHeader
        title="Profile & Settings"
        subtitle="Manage your account, password, and notification preferences"
      />

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={8}>
          <Card style={cardStyle}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <Avatar
                size={88}
                style={{ backgroundColor: colors.primary, fontSize: 36, fontWeight: 600 }}
              >
                {initial}
              </Avatar>
              <Title level={4} style={{ margin: '16px 0 4px', color: colors.text.primary }}>
                {displayName}
              </Title>
              <Tag color="blue" style={{ marginBottom: 4 }}>
                {user?.role ?? '—'}
              </Tag>
              <Text type="secondary">{user?.email}</Text>
            </div>

            <Divider style={{ borderColor: colors.border }} />

            <Descriptions column={1} size="small" labelStyle={{ color: colors.text.secondary }}>
              <Descriptions.Item label="Phone">{me?.phone || user?.phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="Role">{user?.role ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Member since">
                {me?.createdAt ? new Date(me.createdAt).toLocaleDateString() : '—'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            <Card title="Account details" style={cardStyle}>
              <Skeleton loading={isLoading} active paragraph={{ rows: 4 }}>
                <Form
                  form={detailsForm}
                  layout="vertical"
                  onFinish={(v) => saveDetails.mutate(v)}
                  disabled={!me}
                >
                  <Form.Item
                    name="fullName"
                    label="Full name"
                    rules={[{ required: true, message: 'Full name required' }]}
                  >
                    <Input placeholder="Your full name" />
                  </Form.Item>
                  <Form.Item
                    name="phone"
                    label="Phone"
                    rules={[{ required: true, message: 'Phone required' }]}
                  >
                    <Input placeholder="+265…" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={saveDetails.isPending}>
                    Save changes
                  </Button>
                </Form>
              </Skeleton>
            </Card>

            <Card
              title="Change password"
              style={cardStyle}
              extra={<LockOutlined style={{ color: colors.text.secondary }} />}
            >
              <Form
                form={passwordForm}
                layout="vertical"
                onFinish={(v) => changePassword.mutate(v)}
              >
                <Form.Item
                  name="currentPassword"
                  label="Current password"
                  rules={[{ required: true, message: 'Current password required' }]}
                >
                  <Input.Password placeholder="••••••••" />
                </Form.Item>
                <Form.Item
                  name="newPassword"
                  label="New password"
                  rules={[
                    { required: true, message: 'New password required' },
                    { min: 8, message: 'Must be at least 8 characters' },
                  ]}
                >
                  <Input.Password placeholder="At least 8 characters" />
                </Form.Item>
                <Form.Item
                  name="confirmPassword"
                  label="Confirm new password"
                  dependencies={['newPassword']}
                  rules={[
                    { required: true, message: 'Please confirm' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('newPassword') === value)
                          return Promise.resolve();
                        return Promise.reject(new Error('Passwords do not match'));
                      },
                    }),
                  ]}
                >
                  <Input.Password placeholder="Re-enter new password" />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={changePassword.isPending}>
                  Update password
                </Button>
              </Form>
            </Card>

            <Card
              title="Notification preferences"
              style={cardStyle}
              extra={<NotificationOutlined style={{ color: colors.text.secondary }} />}
            >
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div>
                    <Text strong style={{ color: colors.text.primary }}>
                      SMS
                    </Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        Order and account alerts via SMS
                      </Text>
                    </div>
                  </div>
                  <Switch checked={prefs.sms} onChange={(v) => onTogglePref('sms', v)} />
                </div>
                <Divider style={{ margin: 0, borderColor: colors.border }} />
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div>
                    <Text strong style={{ color: colors.text.primary }}>
                      WhatsApp
                    </Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        Order and account alerts via WhatsApp
                      </Text>
                    </div>
                  </div>
                  <Switch checked={prefs.whatsapp} onChange={(v) => onTogglePref('whatsapp', v)} />
                </div>
                <Divider style={{ margin: 0, borderColor: colors.border }} />
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div>
                    <Text strong style={{ color: colors.text.primary }}>
                      Email
                    </Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        Order and account alerts via email
                      </Text>
                    </div>
                  </div>
                  <Switch checked={prefs.email} onChange={(v) => onTogglePref('email', v)} />
                </div>
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>
    </>
  );
}
