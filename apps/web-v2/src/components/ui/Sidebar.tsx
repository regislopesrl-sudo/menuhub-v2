import Link from 'next/link';
import styles from './sidebar.module.css';

export function Sidebar({
  items,
  activeHref,
}: {
  items: Array<{ href: string; label: string; enabled?: boolean }>;
  activeHref?: string;
}) {
  return (
    <aside className={styles.sidebar} aria-label="Navegacao desktop">
      <div className={styles.brand}>MenuHub</div>
      <div className={styles.navItems}>
        {items.filter((item) => item.enabled !== false).map((item) => (
          <Link key={item.href} href={item.href} className={activeHref === item.href ? styles.active : ''}>
            {item.label}
          </Link>
        ))}
      </div>
    </aside>
  );
}
