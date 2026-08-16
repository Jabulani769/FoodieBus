import { useState } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#f0f2f5',
      }}
    >
      <Card style={{ width: 380 }}>
        <Typography.Title level={3} style={{ textAlign: 'center' }}>
          FoodieBus Financial
        </Typography.Title>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="identifier" label="Email" rules={[{ required: true }]}>
            <Input placeholder="finance@foodiebus.com" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Sign in
          </Button>
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
}
