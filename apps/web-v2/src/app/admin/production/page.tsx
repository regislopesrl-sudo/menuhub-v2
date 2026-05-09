'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  cancelProductionOrder,
  createProductionOrder,
  finishProductionOrder,
  listProductionOrders,
  startProductionOrder,
  type ProductionOrder,
} from '@/features/production/production.api';
import styles from './page.module.css';

type FormState = {
  stockItemId: string;
  recipeId: string;
  plannedQuantity: string;
};

const INITIAL_FORM: FormState = {
  stockItemId: '',
  recipeId: '',
  plannedQuantity: '',
};

export default function AdminProductionPage() {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listProductionOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar ordens.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const totals = useMemo(() => {
    const planned = orders.filter((item) => item.status === 'PLANNED').length;
    const progress = orders.filter((item) => item.status === 'IN_PROGRESS').length;
    const done = orders.filter((item) => item.status === 'FINISHED').length;
    const canceled = orders.filter((item) => item.status === 'CANCELED').length;
    return { planned, progress, done, canceled };
  }, [orders]);

  async function onCreateOrder() {
    setError(null);
    setSuccess(null);
    const plannedQuantity = Number(form.plannedQuantity);
    if (!form.stockItemId.trim() || !Number.isFinite(plannedQuantity) || plannedQuantity <= 0) {
      setError('Informe stockItemId e quantidade planejada maior que zero.');
      return;
    }
    setBusyId('create');
    try {
      await createProductionOrder({
        stockItemId: form.stockItemId.trim(),
        recipeId: form.recipeId.trim() || null,
        plannedQuantity,
      });
      setSuccess('Ordem de produção criada.');
      setForm(INITIAL_FORM);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar ordem.');
    } finally {
      setBusyId(null);
    }
  }

  async function onStart(orderId: string) {
    setBusyId(orderId);
    setError(null);
    setSuccess(null);
    try {
      await startProductionOrder(orderId);
      setSuccess('Ordem iniciada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar ordem.');
    } finally {
      setBusyId(null);
    }
  }

  async function onFinish(orderId: string, plannedQuantity: number) {
    setBusyId(orderId);
    setError(null);
    setSuccess(null);
    try {
      await finishProductionOrder(orderId, plannedQuantity);
      setSuccess('Ordem finalizada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao finalizar ordem.');
    } finally {
      setBusyId(null);
    }
  }

  async function onCancel(orderId: string) {
    const reason = window.prompt('Motivo do cancelamento:')?.trim();
    if (!reason) return;
    setBusyId(orderId);
    setError(null);
    setSuccess(null);
    try {
      await cancelProductionOrder(orderId, reason);
      setSuccess('Ordem cancelada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cancelar ordem.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Carregando produção interna..." />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="Produção Interna"
        subtitle="Planeje e execute ordens de preparo com rastreabilidade por filial."
        right={
          <Link href="/admin">
            <Button>Voltar ao painel</Button>
          </Link>
        }
      />

      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}>{success}</div> : null}

      <section className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <span>Planejadas</span>
          <strong>{totals.planned}</strong>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Em preparo</span>
          <strong>{totals.progress}</strong>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Finalizadas</span>
          <strong>{totals.done}</strong>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Canceladas</span>
          <strong>{totals.canceled}</strong>
        </Card>
      </section>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Nova ordem de produção</h2>
          <Badge>Bloco 25</Badge>
        </div>
        <div className={styles.form}>
          <label className={styles.field}>
            <span>Stock item ID</span>
            <Input value={form.stockItemId} onChange={(e) => setForm((prev) => ({ ...prev, stockItemId: e.target.value }))} />
          </label>
          <label className={styles.field}>
            <span>Recipe ID (opcional)</span>
            <Input value={form.recipeId} onChange={(e) => setForm((prev) => ({ ...prev, recipeId: e.target.value }))} />
          </label>
          <label className={styles.field}>
            <span>Quantidade planejada</span>
            <Input type="number" min="0.001" step="0.001" value={form.plannedQuantity} onChange={(e) => setForm((prev) => ({ ...prev, plannedQuantity: e.target.value }))} />
          </label>
          <Button variant="primary" onClick={() => void onCreateOrder()} disabled={busyId === 'create'}>
            {busyId === 'create' ? 'Salvando...' : 'Criar ordem'}
          </Button>
        </div>
      </Card>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Ordens da filial</h2>
          <Button onClick={() => void load()}>Atualizar</Button>
        </div>

        <div className={styles.list}>
          {orders.length === 0 ? (
            <Card className={styles.orderCard}>Sem ordens de produção para esta filial.</Card>
          ) : (
            orders.map((order) => (
              <article key={order.id} className={styles.orderCard}>
                <div className={styles.orderTop}>
                  <strong>{order.recipe?.name ?? order.stockItem?.name ?? order.id}</strong>
                  <Badge>{order.status}</Badge>
                </div>
                <div className={styles.orderMeta}>
                  <span>Planned: {order.plannedQuantity}</span>
                  <span>Actual: {order.actualQuantity ?? '-'}</span>
                  <span>Stock item: {order.stockItemId}</span>
                  <span>Recipe: {order.recipeId ?? '-'}</span>
                </div>
                <div className={styles.orderActions}>
                  {order.status === 'PLANNED' ? (
                    <Button variant="primary" onClick={() => void onStart(order.id)} disabled={busyId === order.id}>
                      Iniciar
                    </Button>
                  ) : null}
                  {order.status === 'PLANNED' || order.status === 'IN_PROGRESS' ? (
                    <Button onClick={() => void onFinish(order.id, Number(order.plannedQuantity))} disabled={busyId === order.id}>
                      Finalizar
                    </Button>
                  ) : null}
                  {order.status === 'PLANNED' || order.status === 'IN_PROGRESS' ? (
                    <Button onClick={() => void onCancel(order.id)} disabled={busyId === order.id}>
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </Card>
    </main>
  );
}
