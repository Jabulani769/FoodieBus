import { Card, Statistic } from 'antd';

export interface StatCardProps {
  title: string;
  value: string | number;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  loading?: boolean;
}

export function StatCard({ title, value, prefix, suffix, loading }: StatCardProps) {
  return (
    <Card loading={loading} styles={{ body: { padding: 16 } }}>
      <Statistic title={title} value={value} prefix={prefix} suffix={suffix} />
    </Card>
  );
}
