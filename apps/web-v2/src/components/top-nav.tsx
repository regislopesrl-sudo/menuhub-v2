'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import styles from './top-nav.module.css';
import { useModules } from '@/features/modules/use-modules';
import { getAuthSession } from '@/lib/auth-session';
import { logoutCurrentSession } from '@/lib/auth-api';
import { readJwtPayload } from '@/lib/auth-claims';

export function TopNav() {
  const pathname = usePathname();
  const isPublicDeliveryRoute = pathname === '/delivery' || pathname.startsWith('/delivery/');
  const [mounted, setMounted] = useState(false);
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const modules = useModules({ companyId, branchId, userRole: 'admin' });

  useEffect(() => {
    setMounted(true);
  }, []);

  const session = mounted ? getAuthSession() : null;
  const contextLabel = useMemo(() => {
    if (!session?.accessToken) return null;
    const payload = readJwtPayload(session.accessToken);
    const company = String(payload?.companyId ?? '-');
    const branch = String(payload?.branchId ?? '-');
    const role = String(payload?.role ?? 'user');
    return `Empresa: ${company} | Filial: ${branch} | Perfil: ${role}`;
  }, [session?.accessToken]);

  const links = useMemo(
    () =>
      [
    { href: '/', label: 'Login' },
    { href: '/admin', label: 'Painel' },
    mounted && modules.isEnabled('orders') ? { href: '/admin/orders', label: 'Pedidos' } : null,
    mounted && modules.isEnabled('kds') ? { href: '/admin/kds', label: 'KDS' } : null,
    mounted && modules.isEnabled('pdv') ? { href: '/admin/pdv', label: 'PDV' } : null,
    mounted && modules.isEnabled('menu') ? { href: '/admin/menu', label: 'Cardapio' } : null,
    mounted && modules.isEnabled('delivery') ? { href: '/delivery', label: 'Delivery' } : null,
    session?.accessToken ? { href: '/admin/context', label: 'Contexto' } : null,
      ].filter(Boolean) as Array<{ href: string; label: string }>,
    [mounted, modules, session?.accessToken],
  );

  if (isPublicDeliveryRoute) return null;

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
      {contextLabel ? <div className={styles.contextBar}>{contextLabel}</div> : null}
    </header>
  );
}

