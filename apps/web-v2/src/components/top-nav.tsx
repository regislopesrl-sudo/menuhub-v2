'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import styles from './top-nav.module.css';
import { useModules } from '@/features/modules/use-modules';
import { getAuthSession } from '@/lib/auth-session';
import { logoutCurrentSession } from '@/lib/auth-api';
import { readJwtPayload } from '@/lib/auth-claims';
import { apiFetch } from '@/lib/api-fetch';
import { getCompanySettings } from '@/features/settings/settings.api';

type CurrentUserResponse = {
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

type TopNavLink = {
  href: string;
  label: string;
  external?: boolean;
};

export function TopNav() {
  const pathname = usePathname();
  const isPublicDeliveryRoute = pathname === '/delivery' || pathname.startsWith('/delivery/');
  const [mounted, setMounted] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [userLabel, setUserLabel] = useState('');
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const modules = useModules({ companyId, branchId, userRole: 'admin' });

  useEffect(() => {
    setMounted(true);
  }, []);

  const session = mounted ? getAuthSession() : null;
  const tokenContext = useMemo(() => {
    if (!session?.accessToken) {
      return { companyId, branchId, role: 'user' };
    }
    const payload = readJwtPayload(session.accessToken);
    return {
      companyId: String(payload?.companyId ?? companyId),
      branchId: String(payload?.branchId ?? branchId ?? ''),
      role: String(payload?.role ?? 'user'),
    };
  }, [branchId, companyId, session?.accessToken]);

  useEffect(() => {
    if (!mounted || !session?.accessToken) {
      setUserLabel('');
      setStoreName('');
      return;
    }

    setUserLabel(`Usuario: ${tokenContext.role}`);
    let cancelled = false;

    async function loadTopContext() {
      const settingsHeaders = {
        companyId: tokenContext.companyId,
        ...(tokenContext.branchId ? { branchId: tokenContext.branchId } : {}),
      };
      const [me, settings] = await Promise.all([
        apiFetch<CurrentUserResponse>('/v2/auth/me', { method: 'GET' }).catch(() => null),
        getCompanySettings(settingsHeaders).catch(() => null),
      ]);
      if (cancelled) return;

      const resolvedUser = me?.name || me?.email || me?.role || tokenContext.role;
      setUserLabel(`Usuario: ${resolvedUser}`);
      setStoreName(settings?.publicTitle || settings?.deliveryStoreName || settings?.tradeName || '');
    }

    void loadTopContext();
    return () => {
      cancelled = true;
    };
  }, [mounted, session?.accessToken, tokenContext]);

  const contextLabel = useMemo(() => {
    if (!session?.accessToken) return null;
    const company = tokenContext.companyId || '-';
    const branch = tokenContext.branchId || '-';
    const role = tokenContext.role || 'user';
    return `Empresa: ${company} | Filial: ${branch} | Perfil: ${role}`;
  }, [session?.accessToken, tokenContext]);

  const links = useMemo(
    () =>
      [
    { href: '/admin', label: 'Painel' },
    mounted && modules.isEnabled('pdv') ? { href: '/admin/pdv', label: 'PDV' } : null,
    mounted && modules.isEnabled('delivery') ? { href: '/delivery', label: 'Delivery', external: true } : null,
    session?.accessToken ? { href: '/admin/context', label: 'Contexto' } : null,
      ].filter(Boolean) as TopNavLink[],
    [mounted, modules, session?.accessToken],
  );

  if (isPublicDeliveryRoute) return null;

  return (
    <header className={styles.wrap}>
      <nav className={styles.nav}>
        <Link href="/admin" className={styles.brand}>
          <span>MenuHub</span>
          {storeName ? <small>{storeName}</small> : null}
        </Link>
        <div className={styles.links}>
          {userLabel ? <span className={styles.userBadge}>{userLabel}</span> : null}
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
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
                const confirmed = window.confirm('Deseja realmente sair do sistema?');
                if (!confirmed) return;
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

