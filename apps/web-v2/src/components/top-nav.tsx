'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import styles from './top-nav.module.css';
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

const ADMIN_ENTRY_HREF = '/admin/stock?section=alerts';

export function TopNav() {
  const pathname = usePathname();
  const isPublicDeliveryRoute = pathname === '/delivery' || pathname.startsWith('/delivery/');
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const [mounted, setMounted] = useState(false);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [userLabel, setUserLabel] = useState('');
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;

  useEffect(() => {
    setMounted(true);
    setIsEmbedded(window.self !== window.top || new URLSearchParams(window.location.search).get('embed') === '1');
  }, [pathname]);

  const session = mounted ? getAuthSession() : null;
  const showAdminChrome = isAdminRoute || Boolean(session?.accessToken);
  const tokenContext = useMemo(() => {
    if (!session?.accessToken) {
      return { companyId, branchId, role: isAdminRoute ? 'admin' : 'user' };
    }
    const payload = readJwtPayload(session.accessToken);
    return {
      companyId: String(payload?.companyId ?? companyId),
      branchId: String(payload?.branchId ?? branchId ?? ''),
      role: String(payload?.role ?? 'user'),
    };
  }, [branchId, companyId, isAdminRoute, session?.accessToken]);

  useEffect(() => {
    if (!mounted) return;

    if (!session?.accessToken) {
      setUserLabel(isAdminRoute ? 'Usuario: Admin MenuHub' : '');
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
  }, [isAdminRoute, mounted, session?.accessToken, tokenContext]);

  const contextLabel = useMemo(() => {
    if (!showAdminChrome) return null;
    const company = tokenContext.companyId || '-';
    const branch = tokenContext.branchId || '-';
    const role = tokenContext.role || 'user';
    return `Empresa: ${company} | Filial: ${branch} | Perfil: ${role}`;
  }, [showAdminChrome, tokenContext]);

  const links = useMemo<TopNavLink[]>(
    () =>
      showAdminChrome
        ? [
            { href: ADMIN_ENTRY_HREF, label: 'Admin' },
            { href: '/admin/pdv', label: 'PDV' },
            { href: '/delivery', label: 'Delivery', external: true },
            { href: '/admin/context', label: 'Contexto' },
          ]
        : [{ href: ADMIN_ENTRY_HREF, label: 'Admin' }],
    [showAdminChrome],
  );

  if (pathname === '/' || isPublicDeliveryRoute || isAdminRoute || !mounted || isEmbedded) return null;

  return (
    <header className={styles.wrap} data-top-nav="true">
      <nav className={styles.nav}>
        <Link href={ADMIN_ENTRY_HREF} className={styles.brand}>
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
          {showAdminChrome ? (
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
