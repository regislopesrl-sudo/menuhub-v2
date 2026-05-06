'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PremiumEmptyState, PremiumErrorState, PremiumPageHeader } from '@/components/premium';
import { listDeveloperCompanies, type DeveloperCompany } from '@/features/developer/developer-companies.api';
import { getAuthSession } from '@/lib/auth-session';
import styles from './page.module.css';

export default function DeveloperCompaniesPage() {
  const router = useRouter();
  const [items, setItems] = useState<DeveloperCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'>('ALL');
  const [restricted, setRestricted] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await listDeveloperCompanies());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar empresas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const session = getAuthSession();
    const isPlatformUser = session?.role === 'developer' || session?.role === 'technical_admin';
    if (!isPlatformUser) {
      setRestricted(true);
      setLoading(false);
      window.setTimeout(() => {
        router.push('/developer-login');
      }, 1200);
      return;
    }
    void load();
  }, [router]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const statusMatch = statusFilter === 'ALL' ? true : item.status === statusFilter;
      if (!statusMatch) return false;
      if (!query) return true;
      return [item.name, item.legalName, item.slug, item.email, item.document, item.status]
        .some((value) => String(value ?? '').toLowerCase().includes(query));
    });
  }, [items, search, statusFilter]);

  if (restricted) {
    return (
      <main className={styles.page}>
        <Card className={styles.restrictedCard}>
          <h2>Area restrita da plataforma</h2>
          <p>Esta area exige sessao tecnica valida. Redirecionando para o login tecnico...</p>
          <Link href="/developer-login">
            <Button variant="primary">Ir para Developer Login</Button>
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <PremiumPageHeader
        title="Empresas"
        subtitle="Gerencie empresas clientes da plataforma."
      />

      <Card className={styles.filterCard}>
        <Input placeholder="Buscar por nome, slug, documento ou status" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className={styles.filterActions}>
          <Button variant={statusFilter === 'ALL' ? 'primary' : 'default'} onClick={() => setStatusFilter('ALL')}>Todas</Button>
          <Button variant={statusFilter === 'ACTIVE' ? 'primary' : 'default'} onClick={() => setStatusFilter('ACTIVE')}>Ativas</Button>
          <Button variant={statusFilter === 'INACTIVE' ? 'primary' : 'default'} onClick={() => setStatusFilter('INACTIVE')}>Inativas</Button>
          <Button variant={statusFilter === 'SUSPENDED' ? 'primary' : 'default'} onClick={() => setStatusFilter('SUSPENDED')}>Suspensas</Button>
        </div>
      </Card>

      {error ? <PremiumErrorState message={error} onRetry={() => void load()} /> : null}
      {loading ? <Card className={styles.stateCard}>Carregando empresas...</Card> : null}
      {!loading && items.length === 0 ? <PremiumEmptyState title="Nenhuma empresa cadastrada" description="Nao existem empresas para gerenciamento tecnico." /> : null}
      {!loading && items.length > 0 && filteredItems.length === 0 ? (
        <PremiumEmptyState title="Sem resultados" description="Ajuste a busca ou o filtro de status para encontrar empresas." />
      ) : null}

      <section className={styles.grid}>
        {filteredItems.map((item) => (
          <Card key={item.id} className={styles.item}>
            <div className={styles.itemTop}>
              <strong className={styles.companyName}>{item.name ?? item.legalName}</strong>
              <Badge tone={item.status === 'ACTIVE' ? 'success' : item.status === 'SUSPENDED' ? 'danger' : 'warning'}>{item.status}</Badge>
            </div>
            <div className={styles.metaList}>
              <p><span>Slug:</span> {item.slug ?? '-'}</p>
              <p><span>Documento:</span> {item.document ?? '-'}</p>
              <p><span>E-mail:</span> {item.email ?? '-'}</p>
              <p><span>Plano:</span> {item.planName ?? item.planKey ?? 'Sem plano'}</p>
              <p><span>Assinatura:</span> {item.subscriptionStatus ?? 'SEM_ASSINATURA'}</p>
              <p><span>Criacao:</span> {item.createdAt ? new Date(item.createdAt).toLocaleDateString('pt-BR') : '-'}</p>
              <p><span>Modulos:</span> {item.moduleStats.totalInPlan} ativos · {item.moduleStats.blockedOrOff} bloqueados · {item.moduleStats.overrides} ajustes</p>
            </div>
            <div className={styles.itemActions}>
              <Link href={`/developer/companies/${item.id}/modules`}>
                <Button variant="primary">Gerenciar modulos</Button>
              </Link>
            </div>
          </Card>
        ))}
      </section>
    </main>
  );
}
