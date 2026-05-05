'use client';

import type { ReactNode } from 'react';
import styles from './premium.module.css';

type Props = {
  left?: ReactNode;
  right?: ReactNode;
};

export function PremiumActionBar({ left, right }: Props) {
  return (
    <div className={styles.actionBar}>
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
}
