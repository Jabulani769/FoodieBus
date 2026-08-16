import { useState } from 'react';
import { Button, Card, Form, Input, Steps, Typography, message } from 'antd';
import { Link } from 'react-router-dom';
import { Api, extractError } from '@foodiebus/api-client';
import { http } from '../api.js';

const api = new Api(http);

export function ForgotPasswordPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState('');

  const requestReset = async (values: { identifier: string }) => {
    setLoading(true);
    try {
      await api.forgotPassword(values.identifier);
      setIdentifier(values.identifier);
      setStep(1);
    } catch (err) {
      message.error(extractError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async (values: { code: string; newPassword: string }) => {
    setLoading(true);
    try {
      await api.resetPassword(identifier, values.code, values.newPassword);
      message.success('Password reset. Please sign in.');
      setStep(2);
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
      <Card style={{ width: 420 }}>
        <Steps
          current={step}
          size="small"
          style={{ marginBottom: 24 }}
          items={[{ title: 'Request' }, { title: 'Reset' }, { title: 'Done' }]}
        />
        {step === 0 && (
          <Form layout="vertical" onFinish={requestReset}>
            <Form.Item name="identifier" label="Email" rules={[{ required: true }]}>
              <Input placeholder="admin@foodiebus.com" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Send reset code
            </Button>
          </Form>
        )}
        {step === 1 && (
          <Form layout="vertical" onFinish={confirmReset}>
            <Form.Item name="code" label="Verification code" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="newPassword" label="New password" rules={[{ required: true, min: 8 }]}>
              <Input.Password />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Reset password
            </Button>
          </Form>
        )}
        {step === 2 && (
          <Typography.Paragraph style={{ textAlign: 'center' }}>
            Password reset successfully. <Link to="/login">Sign in</Link>
          </Typography.Paragraph>
        )}
      </Card>
    </div>
  );
}
