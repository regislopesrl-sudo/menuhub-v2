'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { getMockPaymentReconciliation, type PaymentReconciliationDivergence, type PaymentReconciliationItem, type PaymentReconciliationResponse } from '@/features/payments/payments.api';
import styles from './page.module.css';

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

const divergenceLabel: Record<PaymentReconciliationDivergence, string> = {
  reconciled: 'Conciliado',
  pending: 'Pendente',
  missing_payment_snapshot: 'Sem snapshot',
  status_mismatch: 'Divergente',
};

const actionLabel: Record<string, string> = {
  none: 'Nenhuma acao',
  await_webhook_or_retry: 'Aguardar webhook ou retry',
  review_checkout_payment_snapshot: 'Revisar snapshot do checkout',
  review_payment_status_and_reprocess_webhook: 'Revisar status e reprocessar webhook',
};

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function toneFor(divergence: PaymentReconciliationDivergence): 'default' | 'success' | 'warning' | 'danger' {
  if (divergence === 'reconciled') return 'success';
  if (divergence === 'status_mismatch') return 'danger';
  if (divergence === 'pending') return 'warning';
  return 'default';
}

export default function AdminPaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [report, setReport] = useState<PaymentReconciliationResponse | null>(null);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [limit, setLimit] = useState('80');
  const [filter, setFilter] = useState<'all' | PaymentReconciliationDivergence>('all');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getMockPaymentReconciliation({
        dateFrom: from ? `${from}T00:00:00.000Z` : undefined,
        dateTo: to ? `${to}T23:59:59.999Z` : undefined,
        limit: Number(limit || '80'),
      });
      setReport(data);
      setNotice(`Conciliacao atualizada: ${data.summary.totalOrders} pedidos analisados.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar conciliacao de pagamentos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  const items = useMemo(() => {
    const rows = report?.items ?? [];
    return filter === 'all' ? rows : rows.filter((item) => item.divergence === filter);
  }, [filter, report]);

  const summary = report?.summary;

  if (loading && !report) {
    return (
      <main className={styles.page}>
        <LoadingState label="Carregando pagamentos operacionais..." />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="Pagamentos Operacionais"
        subtitle="PIX mock, status de pagamento, webhook local, idempotencia e conciliacao operacional."
        right={<Button onClick={() => void load()} disabled={loading}>{loading ? 'Atualizando...' : 'Atualizar'}</Button>}
      />

      {error ? <Card className={styles.error}><strong>{error}</strong></Card> : null}
      {notice ? <Card className={styles.notice}>{notice}</Card> : null}

      <section className={styles.heroGrid}>
        <Card className={styles.heroCard}>
          <small>Provider ativo</small>
          <strong>{report?.provider ?? 'mock'}</strong>
          <span>Modo local seguro, sem captura real de cartao.</span>
        </Card>
        <Card className={styles.heroCard}>
          <small>Pedidos analisados</small>
          <strong>{summary?.totalOrders ?? 0}</strong>
          <span>{money(summary?.totalAmount ?? 0)} em volume bruto.</span>
        </Card>
        <Card className={styles.heroCard}>
          <small>Conciliados</small>
          <strong>{summary?.reconciled ?? 0}</strong>
          <span>{money(summary?.paidAmount ?? 0)} pagos.</span>
        </Card>
        <Card className={styles.heroCard}>
          <small>Divergencias</small>
          <strong>{summary?.statusMismatch ?? 0}</strong>
          <span>{summary?.pending ?? 0} pendentes / {summary?.missingPaymentSnapshot ?? 0} sem snapshot.</span>
        </Card>
      </section>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <small>Filtros de conciliacao</small>
            <h2>Periodo e status</h2>
          </div>
          <Badge>{report?.mode ?? 'mock'}</Badge>
        </div>
        <form className={styles.toolbar} onSubmit={onSubmit}>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <Input type="number" min="1" max="200" value={limit} onChange={(event) => setLimit(event.target.value)} />
          <Select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="all">Todas divergencias</option>
            <option value="reconciled">Conciliados</option>
            <option value="pending">Pendentes</option>
            <option value="missing_payment_snapshot">Sem snapshot</option>
            <option value="status_mismatch">Divergentes</option>
          </Select>
          <Button type="submit" variant="primary" disabled={loading}>{loading ? 'Aplicando...' : 'Aplicar'}</Button>
        </form>
      </Card>

      <section className={styles.statusGrid}>
        <StatusCard label="Conciliado" value={summary?.reconciled ?? 0} tone="success" />
        <StatusCard label="Pendente" value={summary?.pending ?? 0} tone="warning" />
        <StatusCard label="Sem snapshot" value={summary?.missingPaymentSnapshot ?? 0} tone="default" />
        <StatusCard label="Divergente" value={summary?.statusMismatch ?? 0} tone="danger" />
      </section>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <small>Fila de revisao</small>
            <h2>Pedidos e pagamentos</h2>
          </div>
          <Badge>{items.length} itens</Badge>
        </div>
        {items.length === 0 ? <EmptyState title="Nenhum item encontrado" description="Ajuste filtros ou aguarde novos pedidos." /> : null}
        <div className={styles.list}>
          {items.map((item) => <PaymentRow key={`${item.orderId}-${item.providerPaymentId ?? 'none'}`} item={item} />)}
        </div>
      </Card>
    </main>
  );
}

function StatusCard({ label, value, tone }: { label: string; value: number; tone: 'default' | 'success' | 'warning' | 'danger' }) {
  return (
    <Card className={styles.statusCard}>
      <Badge tone={tone}>{label}</Badge>
      <strong>{value}</strong>
    </Card>
  );
}

function PaymentRow({ item }: { item: PaymentReconciliationItem }) {
  return (
    <article className={styles.row}>
      <div className={styles.orderMain}>
        <strong>{item.orderNumber}</strong>
        <Badge tone={toneFor(item.divergence)}>{divergenceLabel[item.divergence]}</Badge>
      </div>
      <div className={styles.rowGrid}>
        <Info label="Pedido" value={item.orderStatus} />
        <Info label="Pagamento" value={item.paymentStatus} />
        <Info label="Provider" value={item.provider ?? '-'} />
        <Info label="Provider ID" value={item.providerPaymentId ?? '-'} />
        <Info label="Metodo" value={item.method ?? '-'} />
        <Info label="Total" value={money(item.totalAmount)} />
        <Info label="Pago" value={money(item.paidAmount)} />
        <Info label="Reembolso" value={money(item.refundedAmount)} />
      </div>
      <div className={styles.actionLine}>
        <span>Acao recomendada: <strong>{actionLabel[item.recommendedAction] ?? item.recommendedAction}</strong></span>
        <small>Atualizado: {item.updatedAt ? new Date(item.updatedAt).toLocaleString('pt-BR') : '-'}</small>
      </div>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <span className={styles.infoPill}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}
