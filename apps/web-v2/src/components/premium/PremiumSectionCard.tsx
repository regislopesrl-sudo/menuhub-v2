'use client';

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import styles from './premium.module.css';

type Props = {
  children: ReactNode;
};

export function PremiumSectionCard({ children }: Props) {
  return <Card className={styles.sectionCard}>{children}</Card>;
}
