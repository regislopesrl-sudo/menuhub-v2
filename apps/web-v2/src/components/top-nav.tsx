'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './top-nav.module.css';
import { useModules } from '@/features/modules/use-modules';
import { getAuthSession } from '@/lib/auth-session';
import { logoutCurrentSession } from '@/lib/auth-api';

export function TopNav() {
  const pathname = usePathname();
  const session = getAuthSession();
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const modules = useModules({ companyId, branchId, userRole: 'admin' });

  const links = [
    { href: '/', label: 'Login' },
    { href: '/admin', label: 'Painel' },
    modules.isEnabled('orders') ? { href: '/admin/orders', label: 'Pedidos' } : null,
    modules.isEnabled('kds') ? { href: '/admin/kds', label: 'KDS' } : null,
    modules.isEnabled('pdv') ? { href: '/admin/pdv', label: 'PDV' } : null,
    modules.isEnabled('menu') ? { href: '/admin/menu', label: 'Cardapio' } : null,
    modules.isEnabled('delivery') ? { href: '/delivery', label: 'Delivery' } : null,
  ].filter(Boolean) as Array<{ href: string; label: string }>;

  return (
    <header className={styles.wrap}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.brand}>MenuHub</Link>
        <div className={styles.links}>
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.link} ${pathname === item.href ? styles.active : ''}`.trim()}
            >
              {item.label}
            </Link>
          ))}
          {session?.accessToken ? (
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                void logoutCurrentSession();
                window.location.href = '/';
              }}
            >
              Sair
            </button>
          ) : null}
        </div>
      </nav>
    </header>
  );
}
