import { useMemo, useState } from 'react';
import { Layout, Menu, Dropdown, Button, Space, Avatar, Typography } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LogoutOutlined,
  DashboardOutlined,
  WalletOutlined,
  ReconciliationOutlined,
  AuditOutlined,
  BarChartOutlined,
  MoneyCollectOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import { Api } from '@foodiebus/api-client';
import { http } from '../api.js';
import { useAuth } from '@foodiebus/auth';
import { colors, brand, NotificationBell } from '@foodiebus/ui';

const { Sider, Header, Content } = Layout;
const api = new Api(http);

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/revenue': 'Revenue',
  '/refunds': 'Refunds',
  '/settlements': 'Settlements',
  '/driver-payouts': 'Driver Payouts',
  '/reconciliation': 'Reconciliation',
  '/analytics': 'Analytics',
  '/profile': 'Profile',
};

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    {
      type: 'group' as const,
      label: 'Overview',
      children: [
        { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
        { key: '/revenue', icon: <MoneyCollectOutlined />, label: 'Revenue' },
        { key: '/analytics', icon: <BarChartOutlined />, label: 'Analytics' },
      ],
    },
    {
      type: 'group' as const,
      label: 'Payments',
      children: [
        { key: '/refunds', icon: <ReconciliationOutlined />, label: 'Refunds' },
        { key: '/settlements', icon: <WalletOutlined />, label: 'Settlements' },
        { key: '/driver-payouts', icon: <MoneyCollectOutlined />, label: 'Driver Payouts' },
      ],
    },
    {
      type: 'group' as const,
      label: 'Operations',
      children: [{ key: '/reconciliation', icon: <AuditOutlined />, label: 'Reconciliation' }],
    },
    {
      type: 'group' as const,
      label: 'Account',
      children: [{ key: '/profile', icon: <IdcardOutlined />, label: 'Profile' }],
    },
  ];

  const selectedKey = useMemo(() => {
    return (
      menuItems
        .flatMap((g) => g.children)
        .find((m) =>
          m.key === '/' ? location.pathname === '/' : location.pathname.startsWith(m.key),
        )?.key ?? ''
    );
  }, [location.pathname, menuItems]);

  const pageTitle = TITLES[selectedKey] ?? 'Finance';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const initials = (user?.fullName || user?.email || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Layout className="app-shell" style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider
        className="sidebar-sider"
        theme="dark"
        breakpoint="lg"
        collapsedWidth={64}
        width={240}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      >
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <WalletOutlined />
          </div>
          {!collapsed && <span className="sidebar-name">FoodieBus</span>}
        </div>
        <div className="sidebar-menu-scroll">
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ borderInlineEnd: 'none' }}
          />
        </div>
        <div className="sidebar-footer">
          <Avatar size={32} style={{ background: brand.color, flexShrink: 0 }}>
            {initials}
          </Avatar>
          {!collapsed && (
            <div className="sidebar-user">
              <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>
                {user?.fullName || user?.email}
              </span>
              <span style={{ fontSize: 11, color: '#64748b' }}>{user?.role}</span>
            </div>
          )}
        </div>
      </Sider>
      <Layout className="app-main" style={{ height: '100vh', overflow: 'hidden' }}>
        <Header
          className="app-header"
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <div className="header-title">
            <Typography.Text strong style={{ fontSize: 16, color: colors.text.primary }}>
              {pageTitle}
            </Typography.Text>
            <span style={{ fontSize: 13, color: colors.text.tertiary, marginLeft: 8 }}>
              / {user?.role?.toLowerCase().replace('_', ' ')}
            </span>
          </div>
          <Space size="middle">
            <NotificationBell api={api} />
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: 'Logout',
                    onClick: handleLogout,
                  },
                ],
              }}
            >
              <Button type="text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar size={28} style={{ background: brand.color, fontSize: 12 }}>
                  {initials}
                </Avatar>
                <span style={{ fontWeight: 500 }}>{user?.fullName || user?.email}</span>
              </Button>
            </Dropdown>
          </Space>
        </Header>
        <Content className="app-content" style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
