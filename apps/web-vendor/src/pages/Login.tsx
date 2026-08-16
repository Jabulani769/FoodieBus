import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Tabs } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@foodiebus/auth';
import { Api } from '@foodiebus/api-client';
import { extractError } from '@foodiebus/api-client';
import { http } from '../api.js';

const api = new Api(http);

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const redirectForRole = (role: string) => {
    if (role === 'VENDOR') return '/vendor';
    if (role === 'OPERATOR') return '/operator';
    return '/login';
  };

  const handleLogin = async (values: { identifier: string; password: string }) => {
    setLoading(true);
    setError(null);
    try {
      const tokens = await api.login(values.identifier, values.password);
      login(
        {
          id: '',
          email: values.identifier,
          phone: '',
          fullName: '',
          role: 'STUDENT',
          isActive: true,
          createdAt: '',
        },
        tokens.accessToken,
        tokens.refreshToken,
      );
      const me = await api.getMe();
      login(me, tokens.accessToken, tokens.refreshToken);
      navigate(redirectForRole(me.role), { replace: true });
    } catch (err) {
      setError(extractError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyInvite = async (values: {
    email: string;
    code: string;
    newPassword: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      await api.verifyInvite(values.email, values.code, values.newPassword);
      const tokens = await api.login(values.email, values.newPassword);
      const me = await api.getMe();
      login(me, tokens.accessToken, tokens.refreshToken);
      navigate(redirectForRole(me.role), { replace: true });
    } catch (err) {
      setError(extractError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      <Card className="auth-card">
        <h1 className="auth-title">FoodieBus</h1>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        <Tabs
          centered
          items={[
            {
              key: 'login',
              label: 'Login',
              children: (
                <Form layout="vertical" onFinish={handleLogin}>
                  <Form.Item
                    name="identifier"
                    label="Email or phone"
                    rules={[{ required: true, message: 'Email or phone is required' }]}
                  >
                    <Input placeholder="you@example.com" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="Password"
                    rules={[{ required: true, message: 'Password is required' }]}
                  >
                    <Input.Password placeholder="••••••••" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={loading}>
                    Sign in
                  </Button>
                </Form>
              ),
            },
            {
              key: 'invite',
              label: 'Accept invite',
              children: (
                <Form layout="vertical" onFinish={handleVerifyInvite}>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[{ required: true, type: 'email', message: 'Valid email required' }]}
                  >
                    <Input placeholder="you@example.com" />
                  </Form.Item>
                  <Form.Item
                    name="code"
                    label="Invite code"
                    rules={[{ required: true, message: '6-digit code required' }]}
                  >
                    <Input placeholder="123456" maxLength={6} />
                  </Form.Item>
                  <Form.Item
                    name="newPassword"
                    label="New password"
                    rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
                  >
                    <Input.Password placeholder="Set a password" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={loading}>
                    Activate account
                  </Button>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
