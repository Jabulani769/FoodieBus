import { Button, Card, Form, Input, message } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Api } from '@foodiebus/api-client';
import { extractError } from '@foodiebus/api-client';
import { http } from '../api.js';
import { useAuth } from '@foodiebus/auth';

import { PageHeader } from '@foodiebus/ui';

const api = new Api(http);

export function ProfilePage() {
  const { user } = useAuth();
  const isVendor = user?.role === 'VENDOR';

  const profileKey = isVendor ? 'vendor-profile' : 'operator-profile';
  const fetchProfile = () => (isVendor ? api.getVendorProfile() : api.getOperatorProfile());
  const updateProfile = (values: object) =>
    isVendor ? api.updateVendorProfile(values) : api.updateOperatorProfile(values);

  const { data: profile } = useQuery({
    queryKey: [profileKey],
    queryFn: fetchProfile,
    enabled: !!user,
  });

  const save = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => message.success('Profile updated'),
    onError: (err) => message.error(extractError(err).message),
  });

  return (
    <>
      <PageHeader title="Profile &amp; Settings" />
      <Card style={{ maxWidth: 560 }}>
        <Form
          layout="vertical"
          initialValues={profile ?? undefined}
          onFinish={(v) => save.mutate(v)}
        >
          <Form.Item
            name="businessName"
            label="Business name"
            rules={[{ required: true, message: 'Business name required' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="logoUrl" label="Logo URL">
            <Input />
          </Form.Item>
          {!isVendor && (
            <Form.Item name="licenseNumber" label="License number">
              <Input />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            Save changes
          </Button>
        </Form>
      </Card>
    </>
  );
}
