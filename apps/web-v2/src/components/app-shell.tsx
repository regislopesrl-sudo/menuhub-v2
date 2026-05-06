'use client';

import type { PropsWithChildren } from 'react';
import styles from './app-shell.module.css';

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className={styles.shell}>
      <div className={styles.glowA} aria-hidden />
      <div className={styles.glowB} aria-hidden />
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
