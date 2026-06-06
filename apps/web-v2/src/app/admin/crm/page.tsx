'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  adjustCustomerLoyalty,
  getCustomerHistory,
  listCrmCustomers,
  type CrmCustomer,
  type CrmCustomerHistory,
} from '@/features/crm/crm.api';
import styles from './page.module.css';

const relationshipShortcuts = [
  { href: '/admin/coupons', label: 'Cupons e descontos', description: 'regras de desconto' },
  { href: '/admin/crm', label: 'Clientes', description: 'historico e perfil' },
  { href: '/admin/crm', label: 'Fidelidade', description: 'pontos e cashback' },
  { href: '/admin/reviews', label: 'Avaliacoes', description: 'nota e retorno' },
  { href: '/admin/promotions', label: 'Food marketing', description: 'campanhas' },
  { href: '/admin/customer-credit', label: 'Fiado', description: 'credito do cliente' },
];

export default function AdminCrmPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [history, setHistory] = useState<CrmCustomerHistory | null>(null);
  const [search, setSearch] = useState('');
  const [points, setPoints] = useState('10');
  const [reason, setReason] = useState('Ajuste manual CRM');

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedId) ?? customers[0] ?? null,
    [customers, selectedId],
  );
  const totalRevenue = useMemo(
    () => customers.reduce((acc, customer) => acc + customer.lastOrders.reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0), 0),
    [customers],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await listCrmCustomers({ search, limit: 80 });
      setCustomers(result.items);
      const nextSelectedId = selectedId || result.items[0]?.id || '';
      setSelectedId(nextSelectedId);
      if (nextSelectedId) {
        setHistory(await getCustomerHistory(nextSelectedId));
      } else {
        setHistory(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar CRM.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openCustomer(customerId: string) {
    setSelectedId(customerId);
    setError(null);
    try {
      setHistory(await getCustomerHistory(customerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar historico.');
    }
  }

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setSelectedId('');
    await load();
  }

  async function onAdjustPoints(event: FormEvent) {
    event.preventDefault();
    if (!selectedCustomer) return;
    const parsed = Number(points);
    if (!Number.isInteger(parsed) || parsed === 0) {
      setError('Informe pontos inteiros diferentes de zero.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adjustCustomerLoyalty(selectedCustomer.id, { points: parsed, reason });
      setNotice('Fidelidade atualizada.');
      await openCustomer(selectedCustomer.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ajustar pontos.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Carregando CRM..." />;

  return (
    <main className={styles.page}>
      <PageHeader
        title="CRM / Clientes"
        subtitle="Historico do cliente, fidelidade e cashback mock sem integracao externa."
        right={<Button onClick={() => void load()}>Atualizar</Button>}
      />

      {error ? <Card className={styles.errorCard}>{error}</Card> : null}
      {notice ? <Card className={styles.noticeCard}>{notice}</Card> : null}

      <Card className={styles.commandBar}>
        {relationshipShortcuts.map((shortcut) => (
          <a key={`${shortcut.href}-${shortcut.label}`} href={shortcut.href} className={shortcut.href === '/admin/crm' ? styles.commandActive : undefined}>
            <strong>{shortcut.label}</strong>
            <span>{shortcut.description}</span>
          </a>
        ))}
      </Card>

      <section className={styles.kpis}>
        <Metric title="Clientes" value={customers.length} />
        <Metric title="VIP" value={customers.filter((customer) => customer.isVip).length} />
        <Metric title="Bloqueados" value={customers.filter((customer) => customer.isBlocked).length} />
        <Metric title="Receita recente" value={money(totalRevenue)} />
      </section>

      <section className={styles.layout}>
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>Base</span>
            <strong>Clientes</strong>
          </div>
          <form className={styles.searchForm} onSubmit={onSearch}>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, telefone ou email" />
            <Button type="submit">Buscar</Button>
          </form>
          {!customers.length ? <EmptyState title="Sem clientes" description="Clientes aparecem quando houver cadastro ou pedido vinculado." /> : null}
          <div className={styles.customerList}>
            {customers.map((customer) => (
              <button
                key={customer.id}
                className={customer.id === selectedCustomer?.id ? styles.customerActive : styles.customerButton}
                type="button"
                onClick={() => void openCustomer(customer.id)}
              >
                <strong>{customer.name}</strong>
                <span>{customer.phone || customer.whatsapp || customer.email || 'Sem contato'}</span>
                <small>{customer.loyaltyBalance} pontos</small>
              </button>
            ))}
          </div>
        </Card>

        <section className={styles.detailStack}>
          <Card className={styles.panel}>
            <div className={styles.panelHeader}>
              <span>Detalhes</span>
              <strong>{history?.customer.name ?? 'Selecione um cliente'}</strong>
            </div>
            {!history ? (
              <EmptyState title="Nenhum cliente selecionado" description="Clique em um cliente para abrir o historico." />
            ) : (
              <div className={styles.profileGrid}>
                <Info label="Telefone" value={history.customer.phone || history.customer.whatsapp || '-'} />
                <Info label="Email" value={history.customer.email || '-'} />
                <Info label="Pontos" value={history.customer.loyaltyBalance} />
                <Info label="Status" value={history.customer.isBlocked ? 'Bloqueado' : 'Ativo'} />
              </div>
            )}
          </Card>

          <Card className={styles.panel}>
            <div className={styles.panelHeader}>
              <span>Fidelidade</span>
              <strong>Ajuste de pontos</strong>
            </div>
            <form className={styles.loyaltyForm} onSubmit={onAdjustPoints}>
              <Input value={points} onChange={(event) => setPoints(event.target.value)} placeholder="Pontos" />
              <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo" />
              <Button type="submit" variant="primary" disabled={!selectedCustomer || saving}>Aplicar</Button>
            </form>
          </Card>

          <Card className={styles.panel}>
            <div className={styles.panelHeader}>
              <span>Historico</span>
              <strong>Ultimos pedidos</strong>
            </div>
            {!history?.orders.length ? <EmptyState title="Sem pedidos" description="Pedidos vinculados ao cliente aparecem aqui." /> : null}
            <div className={styles.list}>
              {history?.orders.map((order) => (
                <article key={order.id} className={styles.row}>
                  <div>
                    <strong>{order.orderNumber}</strong>
                    <p>{order.channel} - {order.status}</p>
                  </div>
                  <b>{money(order.totalAmount)}</b>
                </article>
              ))}
            </div>
          </Card>
        </section>
      </section>
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

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.infoBox}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
