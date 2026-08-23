import { useState } from 'react';
import { Alert, Button, Form, Input, Tabs, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  CarOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
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
      <div className="auth-left">
        <div className="auth-brand">
          <div className="auth-brand-logo">
            <CarOutlined />
          </div>
          <span className="auth-brand-name">FoodieBus</span>
        </div>
        <p className="auth-tagline">
          Sell meals on board and run your bus fleet from a single modern dashboard.
        </p>
        <div className="auth-features">
          <div className="auth-feature">
            <CheckCircleOutlined /> Real-time food orders &amp; live status updates
          </div>
          <div className="auth-feature">
            <TeamOutlined /> Manage dishes, buses, trips &amp; drivers
          </div>
          <div className="auth-feature">
            <SafetyCertificateOutlined /> Secure role-based access
          </div>
        </div>
      </div>
      <div className="auth-right">
        <div className="auth-form-wrap">
          <div className="auth-form-title">Welcome back</div>
          <div className="auth-form-subtitle">Sign in or accept your invite to continue</div>
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
                      <Input placeholder="you@example.com" size="large" />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      label="Password"
                      rules={[{ required: true, message: 'Password is required' }]}
                    >
                      <Input.Password placeholder="••••••••" size="large" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={loading} size="large">
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
                      <Input placeholder="you@example.com" size="large" />
                    </Form.Item>
                    <Form.Item
                      name="code"
                      label="Invite code"
                      rules={[{ required: true, message: '6-digit code required' }]}
                    >
                      <Input placeholder="123456" maxLength={6} size="large" />
                    </Form.Item>
                    <Form.Item
                      name="newPassword"
                      label="New password"
                      rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
                    >
                      <Input.Password placeholder="Set a password" size="large" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={loading} size="large">
                      Activate account
                    </Button>
                  </Form>
                ),
              },
            ]}
          />
          <Typography.Text
            type="secondary"
            style={{ fontSize: 12, display: 'block', marginTop: 8, textAlign: 'center' }}
          >
            © {new Date().getFullYear()} FoodieBus
          </Typography.Text>
        </div>
      </div>
    </div>
  );
}
