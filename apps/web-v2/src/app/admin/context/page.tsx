'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { PremiumPageHeader, PremiumSummaryCard } from '@/components/premium';
import { getAuthSession } from '@/lib/auth-session';
import { readJwtPayload } from '@/lib/auth-claims';
import styles from './page.module.css';

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
      <PremiumPageHeader
        title="Contexto atual de acesso"
        subtitle="Confira empresa, filial, perfil e permissoes ativas nesta sessao."
      />

      <section className={styles.summaryGrid}>
        <PremiumSummaryCard label="Empresa" value={String(payload?.companyId ?? '-')} />
        <PremiumSummaryCard label="Filial" value={String(payload?.branchId ?? '-')} />
        <PremiumSummaryCard label="Perfil" value={String(payload?.role ?? '-')} />
        <PremiumSummaryCard label="Permissoes" value={permissions.length} />
      </section>

      <Card className={styles.card}>
        <h2 className={styles.title}>Detalhes da sessao</h2>
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
          <span className={styles.label}>Permissoes</span>
          <span className={styles.value}>{permissions.length ? permissions.join(', ') : '-'}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Sessao</span>
          <span className={styles.value}>{String(payload?.sessionId ?? '-')}</span>
        </div>
      </Card>
    </main>
  );
}
