import type { PropsWithChildren } from 'react';
import styles from './status-pill.module.css';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'violet';

export function StatusPill({ tone = 'neutral', children, pulse = false }: PropsWithChildren<{ tone?: Tone; pulse?: boolean }>) {
  return <span className={`${styles.pill} ${styles[tone]} ${pulse ? styles.pulse : ''}`.trim()}>{children}</span>;
}
