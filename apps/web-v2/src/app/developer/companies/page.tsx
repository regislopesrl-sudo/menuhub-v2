'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PremiumEmptyState, PremiumErrorState, PremiumPageHeader } from '@/components/premium';
import {
  createDeveloperCompany,
  listDeveloperCompanies,
  patchDeveloperCompany,
  type DeveloperCompany,
} from '@/features/modules/developer-commercial.api';
import styles from './page.module.css';

export default function DeveloperCompaniesPage() {
  const [items, setItems] = useState<DeveloperCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [form, setForm] = useState({ name: '', legalName: '', slug: '', email: '', phone: '' });

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
    void load();
  }, []);

  async function createCompany() {
    setError(null);
    setCreating(true);
    try {
      await createDeveloperCompany({
        name: form.name,
        legalName: form.legalName,
        slug: form.slug,
        email: form.email || undefined,
        phone: form.phone || undefined,
      });
      setForm({ name: '', legalName: '', slug: '', email: '', phone: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar empresa.');
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(item: DeveloperCompany) {
    const next = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await patchDeveloperCompany(item.id, { status: next });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar status.');
    }
  }

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const statusMatch = statusFilter === 'ALL' ? true : item.status === statusFilter;
      if (!statusMatch) return false;
      if (!query) return true;
      return [item.name, item.legalName, item.slug, item.email].some((value) => String(value ?? '').toLowerCase().includes(query));
    });
  }, [items, search, statusFilter]);

  return (
    <main className={styles.page}>
      <PremiumPageHeader
        title="Empresas"
        subtitle="Gerencie clientes, planos, módulos e cobrança."
        actions={
          <Button variant="primary" onClick={() => void createCompany()} disabled={creating}>
            {creating ? 'Criando...' : 'Nova empresa'}
          </Button>
        }
      />

      <Card className={styles.formCard}>
        <Input placeholder="Nome fantasia" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        <Input placeholder="Razao social" value={form.legalName} onChange={(e) => setForm((p) => ({ ...p, legalName: e.target.value }))} />
        <Input placeholder="Slug" value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} />
        <Input placeholder="E-mail" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
        <Input placeholder="Telefone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
      </Card>

      <Card className={styles.filterCard}>
        <Input placeholder="Buscar por nome, slug ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className={styles.filterActions}>
          <Button variant={statusFilter === 'ALL' ? 'primary' : 'default'} onClick={() => setStatusFilter('ALL')}>Todas</Button>
          <Button variant={statusFilter === 'ACTIVE' ? 'primary' : 'default'} onClick={() => setStatusFilter('ACTIVE')}>Ativas</Button>
          <Button variant={statusFilter === 'INACTIVE' ? 'primary' : 'default'} onClick={() => setStatusFilter('INACTIVE')}>Inativas</Button>
        </div>
      </Card>

      {error ? <PremiumErrorState message={error} onRetry={() => void load()} /> : null}
      {loading ? <Card className={styles.stateCard}>Carregando empresas...</Card> : null}
      {!loading && items.length === 0 ? <PremiumEmptyState title="Nenhuma empresa cadastrada" description="Crie uma nova empresa para iniciar o fluxo comercial SaaS." /> : null}
      {!loading && items.length > 0 && filteredItems.length === 0 ? (
        <PremiumEmptyState title="Sem resultados" description="Ajuste a busca ou o filtro de status para encontrar empresas." />
      ) : null}

      <section className={styles.grid}>
        {filteredItems.map((item) => (
          <Card key={item.id} className={styles.item}>
            <div className={styles.itemTop}>
              <strong className={styles.companyName}>{item.name ?? item.legalName}</strong>
              <Badge tone={item.status === 'ACTIVE' ? 'success' : 'warning'}>{item.status}</Badge>
            </div>
            <div className={styles.metaList}>
              <p><span>Slug:</span> {item.slug ?? '-'}</p>
              <p><span>E-mail:</span> {item.email ?? '-'}</p>
              <p><span>Plano:</span> {item.planName ?? item.planKey ?? 'Sem plano'}</p>
              <p><span>Assinatura:</span> {item.subscriptionStatus ?? 'SEM_ASSINATURA'}</p>
              <p><span>Módulos:</span> {item.moduleStats.totalInPlan} ativos · {item.moduleStats.blockedOrOff} bloqueados · {item.moduleStats.overrides} ajustes</p>
            </div>
            <div className={styles.itemActions}>
              <div className={styles.primaryActions}>
                <Link href={`/developer/companies/${item.id}/subscription`}>
                  <Button variant="primary">Assinatura</Button>
                </Link>
                <Link href={`/developer/companies/${item.id}/modules`}>
                  <Button>Modulos</Button>
                </Link>
                <Link href={`/developer/companies/${item.id}/billing`}>
                  <Button>Billing</Button>
                </Link>
              </div>
              <div className={styles.dangerAction}>
                <Button variant="danger" onClick={() => void toggleStatus(item)}>
                  {item.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </section>
    </main>
  );
}
