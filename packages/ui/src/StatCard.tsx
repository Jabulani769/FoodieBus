import { Card, Skeleton, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { colors } from './theme.js';

export interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: number | null;
  trendLabel?: string;
  color?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  loading?: boolean;
}

export function StatCard({
  title,
  value,
  icon,
  trend,
  trendLabel,
  color = colors.primary,
  prefix,
  suffix,
  loading,
}: StatCardProps) {
  const hasTrend = typeof trend === 'number';
  const isUp = hasTrend && trend! >= 0;
  const trendColor = hasTrend ? (isUp ? colors.success : colors.danger) : undefined;

  return (
    <Card
      loading={false}
      styles={{ body: { padding: 20 } }}
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: 3,
          width: '100%',
          background: `linear-gradient(90deg, ${color} 0%, ${color}99 100%)`,
        }}
      />
      {loading ? (
        <Skeleton active paragraph={{ rows: 1 }} />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <Typography.Text
              style={{
                fontSize: 13,
                color: colors.text.secondary,
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
              }}
            >
              {title}
            </Typography.Text>
            {hasTrend && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  color: trendColor,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: `${trendColor}1a`,
                }}
              >
                {isUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                {Math.abs(trend!).toFixed(1)}%
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography.Title
              level={3}
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 600,
                color: colors.text.primary,
              }}
            >
              {prefix}
              {value}
              {suffix}
            </Typography.Title>
            {icon && (
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `${color}14`,
                  color,
                  fontSize: 20,
                }}
              >
                {icon}
              </div>
            )}
          </div>
          {trendLabel && (
            <div style={{ marginTop: 8, fontSize: 12, color: colors.text.tertiary }}>
              {trendLabel}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
