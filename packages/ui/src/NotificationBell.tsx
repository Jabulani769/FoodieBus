import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Dropdown, Empty, List, Spin, Typography } from 'antd';
import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import { colors } from './theme.js';
import { formatRelativeTime } from './format.js';

export interface NotificationItem {
  id: string;
  channel?: string | null;
  subject?: string | null;
  body: string;
  status?: string | null;
  reference?: string | null;
  referenceType?: string | null;
  createdAt: string;
}

export interface NotificationsApi {
  getMyNotifications(
    page?: number,
    limit?: number,
  ): Promise<{ items: NotificationItem[]; total: number }>;
  markNotificationRead(id: string): Promise<{ id: string }>;
}

const POLL_INTERVAL_MS = 60_000;

export function useNotifications(api: NotificationsApi) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getMyNotifications(1, 20);
      setItems(res.items);
    } catch {
      // Non-fatal: keep previous items on transient errors.
    } finally {
      setLoading(false);
    }
  }, [api]);

  const markRead = useCallback(
    async (id: string) => {
      try {
        await api.markNotificationRead(id);
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'READ' } : n)));
      } catch {
        // Ignore; the item stays unread until next refresh.
      }
    },
    [api],
  );

  const markAllRead = useCallback(async () => {
    const unread = items.filter((n) => n.status !== 'READ');
    await Promise.all(unread.map((n) => api.markNotificationRead(n.id).catch(() => undefined)));
    setItems((prev) => prev.map((n) => ({ ...n, status: 'READ' })));
  }, [api, items]);

  const unreadCount = items.filter((n) => n.status !== 'READ').length;

  useEffect(() => {
    if (open) void fetch();
  }, [open, fetch]);

  useEffect(() => {
    void fetch();
    const timer = setInterval(() => void fetch(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetch]);

  return { items, unreadCount, loading, open, setOpen, markRead, markAllRead };
}

export function NotificationBell({ api }: { api: NotificationsApi }) {
  const { items, unreadCount, loading, open, setOpen, markRead, markAllRead } =
    useNotifications(api);

  const content = (
    <div style={{ width: 340, maxHeight: 440, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 4px 10px',
        }}
      >
        <Typography.Text strong style={{ color: colors.text.primary }}>
          Notifications
        </Typography.Text>
        {unreadCount > 0 && (
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => void markAllRead()}
            style={{ padding: 0 }}
          >
            Mark all read
          </Button>
        )}
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading && items.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No notifications"
            style={{ padding: 32 }}
          />
        ) : (
          <List
            dataSource={items}
            renderItem={(n: NotificationItem) => {
              const unread = n.status !== 'READ';
              return (
                <List.Item
                  style={{
                    cursor: 'pointer',
                    padding: '10px 10px',
                    borderRadius: 8,
                    background: unread ? 'rgba(22, 119, 255, 0.06)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onClick={() => void markRead(n.id)}
                >
                  <List.Item.Meta
                    title={
                      <span
                        style={{
                          fontWeight: unread ? 600 : 400,
                          color: colors.text.primary,
                          fontSize: 14,
                        }}
                      >
                        {n.subject || n.channel || 'Notification'}
                      </span>
                    }
                    description={
                      <div>
                        <div style={{ color: colors.text.secondary, fontSize: 13 }}>{n.body}</div>
                        <div style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>
                          {formatRelativeTime(n.createdAt)}
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </div>
    </div>
  );

  const hasUnread = unreadCount > 0;

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      dropdownRender={() => content}
      trigger={['click']}
      placement="bottomRight"
    >
      <Badge count={unreadCount} size="small" offset={[-2, 2]}>
        <Button
          type="text"
          shape="circle"
          aria-label="Notifications"
          icon={
            <BellOutlined
              style={{ fontSize: 18, color: hasUnread ? colors.primary : colors.text.secondary }}
            />
          }
          style={{
            background: hasUnread ? 'rgba(22, 119, 255, 0.12)' : '#f1f5f9',
            border: 'none',
            transition: 'background 0.15s',
          }}
        />
      </Badge>
    </Dropdown>
  );
}
