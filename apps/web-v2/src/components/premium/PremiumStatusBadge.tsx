'use client';

import { Badge } from '@/components/ui/Badge';

type Tone = 'default' | 'success' | 'warning' | 'danger';

type Props = {
  label: string;
  tone?: Tone;
};

export function PremiumStatusBadge({ label, tone = 'default' }: Props) {
  return <Badge tone={tone}>{label}</Badge>;
}
