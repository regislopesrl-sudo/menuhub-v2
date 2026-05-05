import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './action-tile.module.css';

type Tone = 'blue' | 'green' | 'orange' | 'red' | 'violet';

export function ActionTile({
  title,
  description,
  href,
  icon,
  tone = 'blue',
  meta,
}: {
  title: string;
  description?: string;
  href: string;
  icon?: ReactNode;
  tone?: Tone;
  meta?: string;
}) {
  return (
    <Link href={href} className={`${styles.tile} ${styles[tone]}`.trim()}>
      <span className={styles.icon}>{icon ?? title.slice(0, 1)}</span>
      <span className={styles.content}>
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      {meta ? <span className={styles.meta}>{meta}</span> : null}
    </Link>
  );
}
