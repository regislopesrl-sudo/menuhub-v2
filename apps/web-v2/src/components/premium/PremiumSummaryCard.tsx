'use client';

import { Card } from '@/components/ui/Card';
import styles from './premium.module.css';

type Props = {
  label: string;
  value: string | number;
};

export function PremiumSummaryCard({ label, value }: Props) {
  return (
    <Card className={styles.summaryCard}>
      <p className={styles.summaryLabel}>{label}</p>
      <p className={styles.summaryValue}>{value}</p>
    </Card>
  );
}
