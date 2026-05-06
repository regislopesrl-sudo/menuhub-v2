'use client';

import type { ReactNode } from 'react';
import styles from './premium.module.css';

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PremiumPageHeader({ title, subtitle, actions }: Props) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.headerText}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {actions ? <div className={styles.headerActions}>{actions}</div> : null}
    </header>
  );
}
