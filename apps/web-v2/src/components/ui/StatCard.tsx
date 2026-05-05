import { Card } from './Card';

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}) {
  return (
    <Card className={`ui-stat-card stat-${tone}`} style={{ padding: 16, borderRadius: 20 }}>
      <div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 900 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 30, fontWeight: 950, letterSpacing: '-0.04em' }}>{value}</div>
      {hint ? <div style={{ marginTop: 7, color: '#64748b', fontSize: 12, fontWeight: 700 }}>{hint}</div> : null}
    </Card>
  );
}
