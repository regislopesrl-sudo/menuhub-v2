'use client';

import { useMemo } from 'react';
import styles from './page.module.css';
import { getAuthSession } from '@/lib/auth-session';
import { readJwtPayload } from '@/lib/auth-claims';

export default function AdminContextPage() {
  const session = getAuthSession();
  const payload = useMemo(
    () => (session?.accessToken ? readJwtPayload(session.accessToken) : null),
    [session?.accessToken],
  );

  const permissions = Array.isArray(payload?.permissions)
    ? (payload?.permissions as string[])
    : [];

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Contexto atual de acesso</h1>
        <div className={styles.row}>
          <span className={styles.label}>Empresa</span>
          <span className={styles.value}>{String(payload?.companyId ?? '-')}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Filial</span>
          <span className={styles.value}>{String(payload?.branchId ?? '-')}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Perfil</span>
          <span className={styles.value}>{String(payload?.role ?? '-')}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Permissões</span>
          <span className={styles.value}>{permissions.length ? permissions.join(', ') : '-'}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Sessão</span>
          <span className={styles.value}>{String(payload?.sessionId ?? '-')}</span>
        </div>
      </section>
    </main>
  );
}
