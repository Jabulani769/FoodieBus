import { useMemo } from 'react';
import { Layout, Menu, Dropdown, Button, Space, Typography } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  ShopOutlined,
  CarOutlined,
  UserOutlined,
  LogoutOutlined,
  DashboardOutlined,
  FileDoneOutlined,
  StarOutlined,
  WalletOutlined,
  ScheduleOutlined,
  TeamOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useAuth } from '@foodiebus/auth';

const { Sider, Header, Content } = Layout;

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = useMemo(() => {
    if (!user) return [];
    if (user.role === 'VENDOR') {
      return [
        { key: '/vendor', icon: <DashboardOutlined />, label: 'Dashboard' },
        { key: '/vendor/menu', icon: <ShopOutlined />, label: 'Menu' },
        { key: '/vendor/orders', icon: <FileDoneOutlined />, label: 'Orders' },
        { key: '/vendor/ratings', icon: <StarOutlined />, label: 'Ratings' },
        { key: '/vendor/payouts', icon: <WalletOutlined />, label: 'Payouts' },
        { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
      ];
    }
    if (user.role === 'OPERATOR') {
      return [
        { key: '/operator', icon: <DashboardOutlined />, label: 'Dashboard' },
        { key: '/operator/buses', icon: <CarOutlined />, label: 'Buses' },
        { key: '/operator/trips', icon: <ScheduleOutlined />, label: 'Trips' },
        { key: '/operator/drivers', icon: <TeamOutlined />, label: 'Drivers' },
        { key: '/operator/settlements', icon: <WalletOutlined />, label: 'Settlements' },
        { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
      ];
    }
    return [];
  }, [user]);

  const selectedKey = useMemo(() => {
    const match = menuItems.find((m) => location.pathname.startsWith(m.key));
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
          FoodieBus
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
          <Typography.Text strong>
            {user?.role === 'VENDOR'
              ? 'Vendor Dashboard'
              : user?.role === 'OPERATOR'
                ? 'Operator Dashboard'
                : ''}
          </Typography.Text>
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
