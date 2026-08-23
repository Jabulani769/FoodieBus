import { Button, Empty } from 'antd';
import type { ReactNode } from 'react';
import { colors } from './theme.js';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: ReactNode;
}

export function EmptyState({
  title = 'Nothing here yet',
  description,
  actionLabel,
  onAction,
  actionIcon,
}: EmptyStateProps) {
  return (
    <div style={{ padding: '48px 16px' }}>
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div>
            <div
              style={{
                fontWeight: 600,
                color: colors.text.primary,
                fontSize: 15,
                marginBottom: 4,
              }}
            >
              {title}
            </div>
            {description && (
              <div style={{ color: colors.text.secondary, fontSize: 13 }}>{description}</div>
            )}
          </div>
        }
      >
        {actionLabel && onAction && (
          <Button type="primary" icon={actionIcon} onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </Empty>
    </div>
  );
}
