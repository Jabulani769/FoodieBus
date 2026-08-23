import type { ThemeConfig } from 'antd';

export const colors = {
  primary: '#1677ff',
  primaryDark: '#0958d9',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  text: {
    primary: '#1f2329',
    secondary: '#667085',
    tertiary: '#98a2b3',
  },
  bg: {
    app: '#f5f7fa',
    card: '#ffffff',
    sidebar: '#0f172a',
    sidebarHover: '#1e293b',
  },
  border: '#e4e7ec',
};

export const theme: ThemeConfig = {
  token: {
    colorPrimary: colors.primary,
    colorInfo: colors.primary,
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorError: colors.danger,
    colorTextBase: colors.text.primary,
    borderRadius: 8,
    fontSize: 14,
    colorBgLayout: colors.bg.app,
    boxShadow: '0 1px 3px rgba(16, 24, 40, 0.08)',
    boxShadowSecondary: '0 4px 12px rgba(16, 24, 40, 0.1)',
  },
  components: {
    Card: {
      borderRadiusLG: 12,
      paddingLG: 24,
    },
    Table: {
      headerBg: '#f8fafc',
      headerColor: colors.text.secondary,
      headerSplitColor: 'transparent',
    },
    Layout: {
      siderBg: colors.bg.sidebar,
      triggerBg: colors.bg.sidebar,
    },
    Menu: {
      darkItemBg: colors.bg.sidebar,
      darkItemSelectedBg: '#1d4ed8',
      darkItemColor: '#94a3b8',
      darkItemHoverBg: colors.bg.sidebarHover,
      darkItemHoverColor: '#e2e8f0',
    },
  },
};

export const brand = {
  name: 'FoodieBus',
  color: colors.primary,
  tagline: 'Modern inter-city transport',
  icon: 'CarOutlined',
};
