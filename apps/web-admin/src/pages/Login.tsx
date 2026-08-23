import { useState } from 'react';
import { Button, Form, Input, Typography, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import {
  CarOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Api, extractError } from '@foodiebus/api-client';
import { useAuth } from '@foodiebus/auth';
import { http } from '../api.js';

const api = new Api(http);

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { identifier: string; password: string }) => {
    setLoading(true);
    try {
      const tokens = await api.login(values.identifier, values.password);
      login(
        {
          id: '',
          email: values.identifier,
          phone: '',
          fullName: '',
          role: 'ADMIN',
          isActive: true,
          createdAt: '',
        },
        tokens.accessToken,
        tokens.refreshToken,
      );
      const me = await api.getMe();
      login(me, tokens.accessToken, tokens.refreshToken);
      message.success('Welcome back');
      navigate('/', { replace: true });
    } catch (err) {
      message.error(extractError(err).message);
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
          Admin console for the modern inter-city transport &amp; on-board dining platform.
        </p>
        <div className="auth-features">
          <div className="auth-feature">
            <CheckCircleOutlined /> Real-time booking &amp; payment insights
          </div>
          <div className="auth-feature">
            <TeamOutlined /> Manage users, vendors &amp; operators in one place
          </div>
          <div className="auth-feature">
            <SafetyCertificateOutlined /> Secure role-based access control
          </div>
        </div>
      </div>
      <div className="auth-right">
        <div className="auth-form-wrap">
          <div className="auth-form-title">Admin sign in</div>
          <div className="auth-form-subtitle">Enter your credentials to continue</div>
          <Form layout="vertical" onFinish={onFinish}>
            <Form.Item
              name="identifier"
              label="Email"
              rules={[{ required: true, message: 'Email is required' }]}
            >
              <Input placeholder="admin@foodiebus.com" size="large" />
            </Form.Item>
            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, message: 'Password is required' }]}
            >
              <Input.Password size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              Sign in
            </Button>
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Link to="/forgot-password">Forgot password?</Link>
            </div>
          </Form>
          <Typography.Text
            type="secondary"
            style={{ fontSize: 12, display: 'block', marginTop: 24 }}
          >
            © {new Date().getFullYear()} FoodieBus
          </Typography.Text>
        </div>
      </div>
    </div>
  );
}
