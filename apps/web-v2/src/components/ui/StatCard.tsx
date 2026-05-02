import { Card } from './Card';

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card className="ui-stat-card" style={{ padding: 14 }}>
      <div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 26, fontWeight: 800 }}>{value}</div>
      {hint ? <div style={{ marginTop: 6, color: '#64748b', fontSize: 12 }}>{hint}</div> : null}
    </Card>
  );
}
