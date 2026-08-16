import { useMemo } from 'react';
import { Layout, Menu, Dropdown, Button, Space, Typography } from 'antd';
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
} from '@ant-design/icons';
import { useAuth } from '@foodiebus/auth';

const { Sider, Header, Content } = Layout;

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/users', icon: <UserOutlined />, label: 'Users' },
    { key: '/vendors', icon: <ShopOutlined />, label: 'Vendors' },
    { key: '/operators', icon: <CarOutlined />, label: 'Operators' },
    { key: '/categories', icon: <TagsOutlined />, label: 'Categories' },
    { key: '/audit-logs', icon: <FileSearchOutlined />, label: 'Audit Logs' },
    { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
  ];

  const selectedKey = useMemo(() => {
    const match = menuItems.find((m) =>
      m.key === '/' ? location.pathname === '/' : location.pathname.startsWith(m.key),
    );
    return match?.key ?? '';
  }, [location.pathname, menuItems]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" breakpoint="lg" collapsedWidth={64}>
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          FoodieBus Admin
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          <Typography.Text strong>Admin Dashboard</Typography.Text>
          <Space>
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
              <Button type="text" icon={<UserOutlined />}>
                {user?.fullName || user?.email}
              </Button>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
