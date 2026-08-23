import { Typography } from 'antd';
import type { ReactNode } from 'react';
import { colors } from './theme.js';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  extra?: ReactNode;
}

export function PageHeader({ title, subtitle, extra }: PageHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 24,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <Typography.Title
          level={4}
          style={{ margin: 0, fontWeight: 600, color: colors.text.primary }}
        >
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Text
            style={{
              color: colors.text.secondary,
              fontSize: 14,
              display: 'inline-block',
              marginTop: 4,
            }}
          >
            {subtitle}
          </Typography.Text>
        )}
      </div>
      {extra && <div style={{ display: 'flex', gap: 8 }}>{extra}</div>}
    </div>
  );
}
