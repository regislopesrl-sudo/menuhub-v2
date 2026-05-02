import type { PropsWithChildren } from 'react';

type Tone = 'default' | 'success' | 'warning' | 'danger';

const toneStyles: Record<Tone, { color: string; bg: string; border: string }> = {
  default: { color: '#334155', bg: '#f8fafc', border: '#cbd5e1' },
  success: { color: '#166534', bg: '#dcfce7', border: '#86efac' },
  warning: { color: '#92400e', bg: '#fef3c7', border: '#fcd34d' },
  danger: { color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
};

export function Badge({ tone = 'default', children, className }: PropsWithChildren<{ tone?: Tone; className?: string }>) {
  const toneStyle = toneStyles[tone];
  return (
    <span
      className={`ui-badge ${className ?? ''}`.trim()}
      style={{ color: toneStyle.color, background: toneStyle.bg, borderColor: toneStyle.border }}
    >
      {children}
    </span>
  );
}
