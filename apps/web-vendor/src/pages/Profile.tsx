import { useEffect } from 'react';
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
  Tag,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { colors, PageHeader, cardStyle } from '@foodiebus/ui';
import { http } from '../api.js';
import { useAuth } from '@foodiebus/auth';

const api = new Api(http);
const { Title, Text } = Typography;

export function ProfilePage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isVendor = user?.role === 'VENDOR';

  const profileKey = isVendor ? 'vendor-profile' : 'operator-profile';
  const fetchProfile = () => (isVendor ? api.getVendorProfile() : api.getOperatorProfile());
  const updateProfile = (values: object) =>
    isVendor ? api.updateVendorProfile(values) : api.updateOperatorProfile(values);

  const { data: profile, isLoading } = useQuery({
    queryKey: [profileKey],
    queryFn: fetchProfile,
    enabled: !!user,
  });

  const [form] = Form.useForm();

  useEffect(() => {
    if (profile) form.setFieldsValue(profile);
  }, [profile, form]);

  const save = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      message.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: [profileKey] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const displayName = profile?.businessName || user?.fullName || '—';
  const initial = (displayName || 'U').charAt(0).toUpperCase();

  return (
    <>
      <PageHeader
        title="Profile & Settings"
        subtitle="Manage your business profile and account details"
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
                src={profile?.logoUrl}
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
              <Descriptions.Item label="Phone">
                {profile?.phone || user?.phone || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Role">{user?.role ?? '—'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Card title="Business information" style={cardStyle}>
            <Skeleton loading={isLoading} active paragraph={{ rows: 6 }}>
              <Form
                form={form}
                layout="vertical"
                onFinish={(v) => save.mutate(v)}
                disabled={!profile}
              >
                <Title level={5} style={{ marginTop: 0, color: colors.text.primary }}>
                  Business details
                </Title>
                <Form.Item
                  name="businessName"
                  label="Business name"
                  rules={[{ required: true, message: 'Business name required' }]}
                >
                  <Input placeholder="Your business name" />
                </Form.Item>
                <Form.Item name="description" label="Description">
                  <Input.TextArea rows={3} maxLength={500} placeholder="Short description…" />
                </Form.Item>
                <Form.Item name="logoUrl" label="Logo URL">
                  <Input placeholder="https://…" />
                </Form.Item>

                <Divider style={{ borderColor: colors.border }} />

                <Title level={5} style={{ color: colors.text.primary }}>
                  Contact
                </Title>
                <Form.Item name="phone" label="Phone">
                  <Input placeholder="+265…" />
                </Form.Item>
                {!isVendor && (
                  <Form.Item name="licenseNumber" label="License number">
                    <Input />
                  </Form.Item>
                )}

                <Space>
                  <Button type="primary" htmlType="submit" loading={save.isPending}>
                    Save changes
                  </Button>
                </Space>
              </Form>
            </Skeleton>
          </Card>
        </Col>
      </Row>
    </>
  );
}
