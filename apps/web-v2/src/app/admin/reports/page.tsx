'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { getFinanceReport, type FinanceBreakdownItem, type FinanceReport } from '@/features/finance/finance.api';
import { getOrderSummary, listOrders, type OrderListItem, type OrderSummary, type OrdersHeaders } from '@/features/orders/orders.api';
import styles from './page.module.css';

type RankedItem = {
  key: string;
  label: string;
  value: number;
  amount?: number;
};

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  PENDING_CONFIRMATION: 'Aguardando confirmacao',
  CONFIRMED: 'Confirmado',
  IN_PREPARATION: 'Em preparo',
  READY: 'Pronto',
  WAITING_PICKUP: 'Aguardando retirada',
  WAITING_DISPATCH: 'Aguardando entrega',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  COMPLETED: 'Concluido',
  CANCELED: 'Cancelado',
};

const CHANNEL_LABELS: Record<string, string> = {
  DELIVERY: 'Delivery',
  PDV: 'PDV',
  KDS: 'Cozinha',
  WAITER: 'Garcom',
  KIOSK: 'Totem',
  ONLINE: 'Online',
  TAKEOUT: 'Retirada',
};

export default function AdminReportsPage() {
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const headers = useMemo<OrdersHeaders>(
    () => ({
      companyId,
      branchId,
      userRole: 'admin',
    }),
    [branchId, companyId],
  );

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [finance, setFinance] = useState<FinanceReport | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [summaryRes, ordersRes, financeRes] = await Promise.all([
        getOrderSummary({ headers, dateFrom: from, dateTo: to }),
        listOrders({ headers, createdFrom: from, createdTo: to, limit: 300, sortBy: 'createdAt', sortDirection: 'desc' }),
        getFinanceReport({ from, to, branchId }),
      ]);

      setOrderSummary(summaryRes);
      setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
      setFinance(financeRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar relatorios.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onApplyPeriod(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  const channelRows = useMemo(() => {
    const byAmount = new Map<string, { count: number; amount: number }>();
    for (const order of orders) {
      const key = String(order.channel || 'OUTROS').toUpperCase();
      const current = byAmount.get(key) ?? { count: 0, amount: 0 };
      current.count += 1;
      current.amount += Number(order.total ?? 0);
      byAmount.set(key, current);
    }

    return Array.from(byAmount.entries())
      .map(([key, value]) => ({ key, label: CHANNEL_LABELS[key] ?? formatLabel(key), value: value.count, amount: value.amount }))
      .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  }, [orders]);

  const statusRows = useMemo(() => {
    const statusMap = new Map<string, number>();
    for (const order of orders) {
      const key = String(order.status || 'UNKNOWN').toUpperCase();
      statusMap.set(key, (statusMap.get(key) ?? 0) + 1);
    }

    return Array.from(statusMap.entries())
      .map(([key, value]) => ({ key, label: STATUS_LABELS[key] ?? formatLabel(key), value }))
      .sort((a, b) => b.value - a.value);
  }, [orders]);

  const paymentRows = useMemo(() => {
    const paymentMap = new Map<string, number>();
    for (const order of orders) {
      const key = String(order.paymentStatus || 'UNKNOWN').toUpperCase();
      paymentMap.set(key, (paymentMap.get(key) ?? 0) + 1);
    }

    return Array.from(paymentMap.entries())
      .map(([key, value]) => ({ key, label: formatLabel(key), value }))
      .sort((a, b) => b.value - a.value);
  }, [orders]);

  if (loading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Carregando relatorios operacionais..." />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="Relatorios Operacionais"
        subtitle="Vendas, canais, financeiro, DRE e pontos de atencao em uma unica central"
        right={<Button onClick={() => void load()}>Atualizar</Button>}
      />

      <Card className={styles.toolbarCard}>
        <form className={styles.toolbar} onSubmit={onApplyPeriod}>
          <label className={styles.field}>
            <span>Inicio</span>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Fim</span>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <Button type="submit" variant="primary">
            Aplicar periodo
          </Button>
        </form>
      </Card>

      {error ? (
        <Card className={styles.errorCard}>
          <Badge tone="danger">Erro</Badge>
          <span>{error}</span>
        </Card>
      ) : null}

      <section className={styles.kpiGrid}>
        <MetricCard title="Pedidos" value={String(orderSummary?.totalOrders ?? orders.length)} hint="Total no periodo" />
        <MetricCard title="Pedidos ativos" value={String(orderSummary?.activeOrders ?? 0)} hint="Em andamento" />
        <MetricCard title="Faturamento bruto" value={money(orderSummary?.grossRevenue ?? finance?.dre.grossRevenue ?? 0)} hint="Pedidos pagos/registrados" />
        <MetricCard title="Ticket medio" value={money(orderSummary?.averageTicket ?? 0)} hint="Media por pedido" />
        <MetricCard title="Margem bruta" value={money(finance?.dre.grossMargin ?? 0)} hint={`${formatPercent(finance?.dre.grossMarginPercent ?? 0)} sobre receita liquida`} />
        <MetricCard title="Lucro operacional" value={money(finance?.dre.operatingProfit ?? 0)} hint={`${formatPercent(finance?.dre.operatingProfitPercent ?? 0)} no periodo`} />
      </section>

      <section className={styles.twoColumns}>
        <ReportPanel title="Vendas por canal" description="Distribuicao dos pedidos por origem operacional.">
          <RankedList rows={channelRows} total={sum(channelRows.map((row) => row.value))} moneyColumn />
        </ReportPanel>

        <ReportPanel title="Status dos pedidos" description="Leitura rapida da fila operacional no periodo.">
          <RankedList rows={statusRows} total={sum(statusRows.map((row) => row.value))} />
        </ReportPanel>
      </section>

      <section className={styles.twoColumns}>
        <ReportPanel title="Financeiro e DRE" description="Resumo gerencial com base nos lancamentos e pedidos.">
          <div className={styles.financeGrid}>
            <MiniLine label="Receita liquida" value={money(finance?.dre.netRevenue ?? 0)} />
            <MiniLine label="CMV" value={money(finance?.dre.cogs ?? 0)} />
            <MiniLine label="Despesas operacionais" value={money(finance?.dre.operatingExpenses ?? 0)} />
            <MiniLine label="Saldo realizado" value={money(finance?.cashFlow.realized.balance ?? 0)} />
            <MiniLine label="Contas a pagar abertas" value={money(finance?.totals.openPayables ?? 0)} />
            <MiniLine label="Contas a receber abertas" value={money(finance?.totals.openReceivables ?? 0)} />
          </div>
        </ReportPanel>

        <ReportPanel title="Pagamentos e conciliacao" description="Visao de divergencias e status de pagamentos.">
          <div className={styles.statusBox}>
            <MiniLine label="Itens conciliados/analisados" value={String(finance?.reconciliation.summary.totalItems ?? 0)} />
            <MiniLine label="Divergentes" value={String(finance?.reconciliation.summary.divergent ?? 0)} danger={(finance?.reconciliation.summary.divergent ?? 0) > 0} />
            <MiniLine label="Pendentes" value={String(finance?.reconciliation.summary.pending ?? 0)} />
          </div>
          <RankedList rows={paymentRows} total={sum(paymentRows.map((row) => row.value))} />
        </ReportPanel>
      </section>

      <section className={styles.twoColumns}>
        <BreakdownPanel title="Categorias financeiras" rows={finance?.breakdowns.categories ?? []} />
        <BreakdownPanel title="Centros de custo" rows={finance?.breakdowns.costCenters ?? []} />
      </section>
    </main>
  );
}

function MetricCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card className={styles.metricCard}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </Card>
  );
}

function ReportPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

function RankedList({ rows, total, moneyColumn = false }: { rows: RankedItem[]; total: number; moneyColumn?: boolean }) {
  if (!rows.length) {
    return <EmptyState title="Sem dados no periodo" description="Quando houver movimentacao, os indicadores aparecem aqui." />;
  }

  return (
    <div className={styles.rankList}>
      {rows.map((row) => {
        const percent = total > 0 ? Math.min(100, Math.round((row.value / total) * 100)) : 0;
        return (
          <div className={styles.rankRow} key={row.key}>
            <div className={styles.rankTop}>
              <strong>{row.label}</strong>
              <span>{moneyColumn && row.amount !== undefined ? `${row.value} pedidos - ${money(row.amount)}` : row.value}</span>
            </div>
            <div className={styles.barTrack}>
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BreakdownPanel({ title, rows }: { title: string; rows: FinanceBreakdownItem[] }) {
  return (
    <ReportPanel title={title} description="Receitas, despesas e pendencias por agrupamento.">
      {rows.length ? (
        <div className={styles.breakdownList}>
          {rows.slice(0, 8).map((row) => (
            <div className={styles.breakdownRow} key={row.key}>
              <strong>{row.label}</strong>
              <span>Receita {money(row.revenue)}</span>
              <span>Despesa {money(row.expense)}</span>
              <span>Pendente {money(row.pendingReceivable + row.pendingPayable)}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Sem agrupamentos" description="Categorias e centros de custo ainda nao possuem movimentacao no periodo." />
      )}
    </ReportPanel>
  );
}

function MiniLine({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`${styles.miniLine} ${danger ? styles.dangerLine : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function money(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}
