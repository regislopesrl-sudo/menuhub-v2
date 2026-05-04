'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
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
  const [error, setError] = useState<string | null>(null);
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

  return (
    <main className={styles.page}>
      <h1>Developer Companies</h1>
      <Card className={styles.formCard}>
        <Input placeholder="Nome" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        <Input placeholder="Razao social" value={form.legalName} onChange={(e) => setForm((p) => ({ ...p, legalName: e.target.value }))} />
        <Input placeholder="Slug" value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} />
        <Input placeholder="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
        <Input placeholder="Telefone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
        <Button variant="primary" onClick={() => void createCompany()}>Criar empresa</Button>
      </Card>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p>Carregando...</p> : null}

      <section className={styles.grid}>
        {items.map((item) => (
          <Card key={item.id} className={styles.item}>
            <div className={styles.row}>
              <strong>{item.name ?? item.legalName}</strong>
              <Badge>{item.status}</Badge>
            </div>
            <p>{item.slug}</p>
            <p>{item.email ?? '-'}</p>
            <div className={styles.row}>
              <Button onClick={() => void toggleStatus(item)}>{item.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}</Button>
              <Link href={`/companies/${item.id}/subscription`}>
                <Button variant="primary">Assinatura</Button>
              </Link>
            </div>
          </Card>
        ))}
      </section>
    </main>
  );
}
