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
  applyRecipeSubstitution,
  cancelProductionOrder,
  createProductionOrder,
  finishProductionOrder,
  listProductionLosses,
  listProductMargins,
  registerProductionLoss,
  listProductionOrders,
  previewRecipeSubstitution,
  type RecipeSubstitutionPreview,
  startProductionOrder,
  type ProductionLossEvent,
  type ProductMarginResponse,
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

type SubstitutionForm = {
  recipeId: string;
  fromStockItemId: string;
  toStockItemId: string;
  quantityRatio: string;
  reason: string;
};

const INITIAL_SUBSTITUTION: SubstitutionForm = {
  recipeId: '',
  fromStockItemId: '',
  toStockItemId: '',
  quantityRatio: '1',
  reason: '',
};

export default function AdminProductionPage() {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [losses, setLosses] = useState<ProductionLossEvent[]>([]);
  const [substitution, setSubstitution] = useState<SubstitutionForm>(INITIAL_SUBSTITUTION);
  const [subPreview, setSubPreview] = useState<RecipeSubstitutionPreview | null>(null);
  const [margins, setMargins] = useState<ProductMarginResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listProductionOrders();
      setOrders(Array.isArray(data) ? data : []);
      const lossData = await listProductionLosses();
      setLosses(Array.isArray(lossData) ? lossData : []);
      const marginData = await listProductMargins();
      setMargins(marginData);
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

  async function onRegisterLoss(orderId: string) {
    const quantityRaw = window.prompt('Quantidade perdida:');
    if (!quantityRaw) return;
    const quantity = Number(quantityRaw);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Quantidade de perda invalida.');
      return;
    }
    const reason = window.prompt('Motivo da perda (opcional):')?.trim();

    setBusyId(orderId);
    setError(null);
    setSuccess(null);
    try {
      await registerProductionLoss(orderId, { quantity, reason: reason || undefined });
      setSuccess('Perda de preparo registrada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar perda.');
    } finally {
      setBusyId(null);
    }
  }

  async function onPreviewSubstitution() {
    if (!substitution.recipeId.trim() || !substitution.fromStockItemId.trim() || !substitution.toStockItemId.trim()) {
      setError('Informe recipeId, fromStockItemId e toStockItemId.');
      return;
    }
    const quantityRatio = Number(substitution.quantityRatio || '1');
    if (!Number.isFinite(quantityRatio) || quantityRatio <= 0) {
      setError('quantityRatio deve ser maior que zero.');
      return;
    }
    setBusyId('sub-preview');
    setError(null);
    try {
      const preview = await previewRecipeSubstitution(substitution.recipeId.trim(), {
        fromStockItemId: substitution.fromStockItemId.trim(),
        toStockItemId: substitution.toStockItemId.trim(),
        quantityRatio,
      });
      setSubPreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar preview de substituicao.');
    } finally {
      setBusyId(null);
    }
  }

  async function onApplySubstitution() {
    if (!subPreview) {
      setError('Gere preview antes de aplicar a substituicao.');
      return;
    }
    setBusyId('sub-apply');
    setError(null);
    setSuccess(null);
    try {
      await applyRecipeSubstitution(substitution.recipeId.trim(), {
        fromStockItemId: substitution.fromStockItemId.trim(),
        toStockItemId: substitution.toStockItemId.trim(),
        quantityRatio: Number(substitution.quantityRatio || '1'),
        reason: substitution.reason.trim() || undefined,
      });
      setSuccess('Substituicao aplicada na ficha tecnica.');
      setSubstitution(INITIAL_SUBSTITUTION);
      setSubPreview(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aplicar substituicao.');
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

      <section className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <span>Margem crítica</span>
          <strong>{margins?.summary.critical ?? 0}</strong>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Margem alerta</span>
          <strong>{margins?.summary.warning ?? 0}</strong>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Margem saudável</span>
          <strong>{margins?.summary.healthy ?? 0}</strong>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Produtos com ficha</span>
          <strong>{margins?.summary.total ?? 0}</strong>
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
                  <Button onClick={() => void onRegisterLoss(order.id)} disabled={busyId === order.id}>
                    Registrar perda
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>
      </Card>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Perdas de preparo</h2>
          <Badge>{losses.length} eventos</Badge>
        </div>
        <div className={styles.list}>
          {losses.length === 0 ? (
            <Card className={styles.orderCard}>Sem perdas registradas para esta filial.</Card>
          ) : (
            losses.map((loss) => (
              <article key={loss.id} className={styles.orderCard}>
                <div className={styles.orderTop}>
                  <strong>Ordem: {loss.sourceId ?? '-'}</strong>
                  <Badge>LOSS</Badge>
                </div>
                <div className={styles.orderMeta}>
                  <span>Item: {loss.stockItemId}</span>
                  <span>Quantidade: {loss.quantity}</span>
                  <span>Custo unitário: R$ {Number(loss.unitCost ?? 0).toFixed(4)}</span>
                  <span>Custo total: R$ {Number(loss.totalCost ?? 0).toFixed(2)}</span>
                  <span>Motivo: {loss.notes ?? '-'}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </Card>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Substituicao de insumos</h2>
          <Badge>Bloco 27</Badge>
        </div>
        <div className={styles.form}>
          <label className={styles.field}>
            <span>Recipe ID</span>
            <Input value={substitution.recipeId} onChange={(e) => setSubstitution((p) => ({ ...p, recipeId: e.target.value }))} />
          </label>
          <label className={styles.field}>
            <span>Item origem (stockItemId)</span>
            <Input value={substitution.fromStockItemId} onChange={(e) => setSubstitution((p) => ({ ...p, fromStockItemId: e.target.value }))} />
          </label>
          <label className={styles.field}>
            <span>Item substituto (stockItemId)</span>
            <Input value={substitution.toStockItemId} onChange={(e) => setSubstitution((p) => ({ ...p, toStockItemId: e.target.value }))} />
          </label>
          <label className={styles.field}>
            <span>Fator de quantidade</span>
            <Input type="number" min="0.001" step="0.001" value={substitution.quantityRatio} onChange={(e) => setSubstitution((p) => ({ ...p, quantityRatio: e.target.value }))} />
          </label>
        </div>
        <div className={styles.form}>
          <label className={styles.field}>
            <span>Motivo (opcional)</span>
            <Input value={substitution.reason} onChange={(e) => setSubstitution((p) => ({ ...p, reason: e.target.value }))} />
          </label>
          <Button onClick={() => void onPreviewSubstitution()} disabled={busyId === 'sub-preview'}>
            {busyId === 'sub-preview' ? 'Processando...' : 'Gerar preview'}
          </Button>
          <Button variant="primary" onClick={() => void onApplySubstitution()} disabled={busyId === 'sub-apply'}>
            {busyId === 'sub-apply' ? 'Aplicando...' : 'Aplicar substituicao'}
          </Button>
        </div>
        {subPreview ? (
          <Card className={styles.orderCard}>
            <div className={styles.orderMeta}>
              <span>Origem: {subPreview.from.name ?? subPreview.from.stockItemId} (R$ {subPreview.from.totalCost.toFixed(2)})</span>
              <span>Substituto: {subPreview.to.name ?? subPreview.to.stockItemId} (R$ {subPreview.to.totalCost.toFixed(2)})</span>
              <span>Delta custo total: R$ {subPreview.impact.deltaTotalCost.toFixed(2)}</span>
            </div>
          </Card>
        ) : null}
      </Card>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Margem por produto (Bloco 28)</h2>
          <Badge>{margins?.summary.total ?? 0} produtos</Badge>
        </div>
        <div className={styles.list}>
          {!margins || margins.items.length === 0 ? (
            <Card className={styles.orderCard}>Sem produtos com ficha técnica para análise de margem.</Card>
          ) : (
            margins.items.map((item) => (
              <article key={item.productId} className={styles.orderCard}>
                <div className={styles.orderTop}>
                  <strong>{item.productName}</strong>
                  <Badge>{item.health}</Badge>
                </div>
                <div className={styles.orderMeta}>
                  <span>Preço venda: R$ {item.effectiveSalePrice.toFixed(2)}</span>
                  <span>Custo unitário: R$ {item.costPerUnit.toFixed(2)}</span>
                  <span>Margem: R$ {item.marginValue.toFixed(2)}</span>
                  <span>Margem %: {item.marginPercent === null ? '-' : `${item.marginPercent.toFixed(2)}%`}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </Card>
    </main>
  );
}
