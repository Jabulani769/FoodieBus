import { useMemo, useState } from 'react';
import { Layout, Menu, Dropdown, Button, Space, Avatar, Typography, Badge } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LogoutOutlined,
  DashboardOutlined,
  FileDoneOutlined,
  StarOutlined,
  WalletOutlined,
  ScheduleOutlined,
  TeamOutlined,
  SettingOutlined,
  BellOutlined,
  CarOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import { useAuth } from '@foodiebus/auth';
import { colors, brand } from '@foodiebus/ui';

const { Sider, Header, Content } = Layout;

const TITLES: Record<string, string> = {
  '/vendor': 'Dashboard',
  '/vendor/menu': 'Menu',
  '/vendor/orders': 'Orders',
  '/vendor/ratings': 'Ratings',
  '/vendor/payouts': 'Payouts',
  '/operator': 'Dashboard',
  '/operator/buses': 'Buses',
  '/operator/trips': 'Trips',
  '/operator/drivers': 'Drivers',
  '/operator/settlements': 'Settlements',
  '/settings': 'Settings',
};

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = useMemo(() => {
    if (!user) return [];
    if (user.role === 'VENDOR') {
      return [
        {
          type: 'group' as const,
          label: 'Manage',
          children: [
            { key: '/vendor', icon: <DashboardOutlined />, label: 'Dashboard' },
            { key: '/vendor/menu', icon: <ShopOutlined />, label: 'Menu' },
            { key: '/vendor/orders', icon: <FileDoneOutlined />, label: 'Orders' },
          ],
        },
        {
          type: 'group' as const,
          label: 'Business',
          children: [
            { key: '/vendor/ratings', icon: <StarOutlined />, label: 'Ratings' },
            { key: '/vendor/payouts', icon: <WalletOutlined />, label: 'Payouts' },
            { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
          ],
        },
      ];
    }
    if (user.role === 'OPERATOR') {
      return [
        {
          type: 'group' as const,
          label: 'Manage',
          children: [
            { key: '/operator', icon: <DashboardOutlined />, label: 'Dashboard' },
            { key: '/operator/buses', icon: <CarOutlined />, label: 'Buses' },
            { key: '/operator/trips', icon: <ScheduleOutlined />, label: 'Trips' },
            { key: '/operator/drivers', icon: <TeamOutlined />, label: 'Drivers' },
          ],
        },
        {
          type: 'group' as const,
          label: 'Business',
          children: [
            { key: '/operator/settlements', icon: <WalletOutlined />, label: 'Settlements' },
            { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
          ],
        },
      ];
    }
    return [];
  }, [user]);

  const selectedKey = useMemo(() => {
    return (
      menuItems
        .flatMap((g) => g.children)
        .filter((m) => location.pathname === m.key || location.pathname.startsWith(m.key))
        .sort((a, b) => b.key.length - a.key.length)[0]?.key ?? ''
    );
  }, [location.pathname, menuItems]);

  const pageTitle = TITLES[selectedKey] ?? (user?.role === 'VENDOR' ? 'Vendor' : 'Operator');

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
            <CarOutlined />
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
            <Button
              type="text"
              shape="circle"
              icon={
                <Badge dot offset={[-6, 6]}>
                  <BellOutlined />
                </Badge>
              }
            />
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
