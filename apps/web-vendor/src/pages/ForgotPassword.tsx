import { useState } from 'react';
import { Alert, Button, Card, Form, Input } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Api } from '@foodiebus/api-client';
import { extractError } from '@foodiebus/api-client';
import { http } from '../api.js';

const api = new Api(http);

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestReset = async (values: { identifier: string }) => {
    setLoading(true);
    setError(null);
    try {
      await api.forgotPassword(values.identifier);
      setIdentifier(values.identifier);
      setStep('reset');
      setInfo('If the account exists, a reset code has been sent via SMS/email.');
    } catch (err) {
      setError(extractError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (values: { code: string; newPassword: string }) => {
    setLoading(true);
    setError(null);
    try {
      await api.resetPassword(identifier, values.code, values.newPassword);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(extractError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      <Card className="auth-card">
        <h1 className="auth-title">Reset password</h1>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        {info && <Alert type="info" message={info} showIcon style={{ marginBottom: 16 }} />}
        {step === 'request' ? (
          <Form layout="vertical" onFinish={requestReset}>
            <Form.Item
              name="identifier"
              label="Email or phone"
              rules={[{ required: true, message: 'Email or phone is required' }]}
            >
              <Input placeholder="you@example.com" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Send reset code
            </Button>
          </Form>
        ) : (
          <Form layout="vertical" onFinish={resetPassword}>
            <Form.Item
              name="code"
              label="Reset code"
              rules={[{ required: true, message: '6-digit code required' }]}
            >
              <Input placeholder="123456" maxLength={6} />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label="New password"
              rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
            >
              <Input.Password placeholder="Set a new password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Reset password
            </Button>
          </Form>
        )}
      </Card>
    </div>
  );
}
