'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { createPromotion, listPromotions, updatePromotion, type Promotion } from '@/features/promotions/promotions.api';
import styles from './page.module.css';

const relationshipShortcuts = [
  { href: '/admin/coupons', label: 'Cupons e descontos', description: 'regras de desconto' },
  { href: '/admin/crm', label: 'Clientes', description: 'historico e perfil' },
  { href: '/admin/crm', label: 'Fidelidade', description: 'pontos e cashback' },
  { href: '/admin/reviews', label: 'Avaliacoes', description: 'nota e retorno' },
  { href: '/admin/promotions', label: 'Food marketing', description: 'campanhas' },
  { href: '/admin/customer-credit', label: 'Fiado', description: 'credito do cliente' },
];

export default function AdminPromotionsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<Promotion[]>([]);
  const [provider, setProvider] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channels, setChannels] = useState('PDV,WEB');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await listPromotions();
      setItems(result.items);
      setProvider(result.provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar promocoes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Nome da promocao e obrigatorio.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createPromotion({
        name,
        description,
        channels: channels.split(',').map((item) => item.trim()).filter(Boolean),
        isActive: true,
      });
      setName('');
      setDescription('');
      setNotice('Promocao criada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar promocao.');
    } finally {
      setSaving(false);
    }
  }

  async function togglePromotion(item: Promotion) {
    setSaving(true);
    setError(null);
    try {
      await updatePromotion(item.id, { isActive: !item.isActive });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar promocao.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Carregando promocoes..." />;

  return (
    <main className={styles.page}>
      <PageHeader
        title="Promocoes"
        subtitle="Campanhas locais preparadas para regras futuras, sem integracao externa."
        right={<Button onClick={() => void load()}>Atualizar</Button>}
      />

      {error ? <Card className={styles.errorCard}>{error}</Card> : null}
      {notice ? <Card className={styles.noticeCard}>{notice}</Card> : null}

      <Card className={styles.commandBar}>
        {relationshipShortcuts.map((shortcut) => (
          <a key={`${shortcut.href}-${shortcut.label}`} href={shortcut.href} className={shortcut.href === '/admin/promotions' ? styles.commandActive : undefined}>
            <strong>{shortcut.label}</strong>
            <span>{shortcut.description}</span>
          </a>
        ))}
      </Card>

      <section className={styles.kpis}>
        <Metric title="Total" value={items.length} />
        <Metric title="Ativas" value={items.filter((item) => item.isActive).length} />
        <Metric title="Inativas" value={items.filter((item) => !item.isActive).length} />
        <Metric title="Provider" value={provider || 'local'} />
      </section>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Cadastro</span>
          <strong>Nova promocao</strong>
        </div>
        <form className={styles.formGrid} onSubmit={onCreate}>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da promocao" />
          <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descricao" />
          <Input value={channels} onChange={(event) => setChannels(event.target.value)} placeholder="Canais separados por virgula" />
          <Button type="submit" variant="primary" disabled={saving}>Criar promocao</Button>
        </form>
      </Card>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Lista</span>
          <strong>Campanhas</strong>
        </div>
        {!items.length ? <EmptyState title="Sem promocoes" description="Cadastre campanhas para preparar o CRM premium." /> : null}
        <div className={styles.cardsGrid}>
          {items.map((item) => (
            <article key={item.id} className={styles.itemCard}>
              <div className={styles.itemTop}>
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.description || 'Sem descricao'}</p>
                </div>
                <Badge tone={item.isActive ? 'success' : 'danger'}>{item.isActive ? 'Ativa' : 'Inativa'}</Badge>
              </div>
              <div className={styles.channelRow}>
                {item.channels.map((channel) => (
                  <span key={`${item.id}-${channel}`}>{channel}</span>
                ))}
              </div>
              <Button onClick={() => void togglePromotion(item)} disabled={saving}>{item.isActive ? 'Desativar' : 'Ativar'}</Button>
            </article>
          ))}
        </div>
      </Card>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string | number }) {
  return (
    <Card className={styles.metric}>
      <span>{title}</span>
      <strong>{value}</strong>
    </Card>
  );
}
