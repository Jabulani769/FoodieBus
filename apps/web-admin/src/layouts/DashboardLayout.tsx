import { useMemo, useState } from 'react';
import { Layout, Menu, Dropdown, Button, Space, Avatar, Typography, Badge } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  UserOutlined,
  LogoutOutlined,
  DashboardOutlined,
  ShopOutlined,
  CarOutlined,
  TagsOutlined,
  FileSearchOutlined,
  SettingOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { useAuth } from '@foodiebus/auth';
import { colors, brand } from '@foodiebus/ui';

const { Sider, Header, Content } = Layout;

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/users': 'Users',
  '/vendors': 'Vendors',
  '/operators': 'Operators',
  '/categories': 'Categories',
  '/audit-logs': 'Audit Logs',
  '/settings': 'Settings',
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
        { key: '/users', icon: <UserOutlined />, label: 'Users' },
      ],
    },
    {
      type: 'group' as const,
      label: 'Platform',
      children: [
        { key: '/vendors', icon: <ShopOutlined />, label: 'Vendors' },
        { key: '/operators', icon: <CarOutlined />, label: 'Operators' },
        { key: '/categories', icon: <TagsOutlined />, label: 'Categories' },
      ],
    },
    {
      type: 'group' as const,
      label: 'System',
      children: [
        { key: '/audit-logs', icon: <FileSearchOutlined />, label: 'Audit Logs' },
        { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
      ],
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

  const pageTitle = TITLES[selectedKey] ?? 'Admin';

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
