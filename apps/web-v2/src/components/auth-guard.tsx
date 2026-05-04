'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authMe } from '@/lib/auth-api';
import { clearAuthSession, getAuthSession } from '@/lib/auth-session';

type Scope = 'admin' | 'developer';

export function AuthGuard({ scope, children }: { scope: Scope; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function validate() {
      const session = getAuthSession();
      if (!session?.accessToken) {
        router.replace(scope === 'developer' ? '/developer-login' : '/');
        return;
      }

      try {
        const me = await authMe();
        const role = String(me.role ?? '').toLowerCase();
        const isDeveloper = role === 'developer';
        const isAdmin = isDeveloper || role === 'admin' || role === 'master' || role === 'owner' || role === 'manager';

        if (scope === 'developer' && !isDeveloper) {
          clearAuthSession();
          router.replace('/developer-login');
          return;
        }

        if (scope === 'admin' && !isAdmin) {
          clearAuthSession();
          router.replace('/');
          return;
        }

        if (active) {
          setReady(true);
        }
      } catch {
        clearAuthSession();
        router.replace(scope === 'developer' ? '/developer-login' : '/');
      }
    }

    void validate();
    return () => {
      active = false;
    };
  }, [pathname, router, scope]);

  if (!ready) {
    return <main style={{ padding: 24 }}>Validando sessao...</main>;
  }

  return <>{children}</>;
}
