'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  getReportsAbcProducts,
  getReportsAbcStockItems,
  getReportsByWaiter,
  getReportsCmv,
  getReportsInventory,
  getReportsOverview,
  type ReportsAbcProducts,
  type ReportsAbcStockItems,
  type BranchRankingRow,
  type FinancialBreakdownRow,
  type OperatorRankingRow,
  type PeakHourRow,
  type ReportBreakdownRow,
  type ReportsCmv,
  type ReportsInventory,
  type ReportsOverview,
  type ReportsWaiter,
  type SalesByDayRow,
  type TopProductRow,
  type NeighborhoodRankingRow,
} from '@/features/reports/reports.api';
import styles from './page.module.css';

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const channelOptions = [
  { value: 'ALL', label: 'Todos canais' },
  { value: 'WEB', label: 'Delivery web' },
  { value: 'PDV', label: 'PDV / Balcao' },
  { value: 'WAITER_APP', label: 'Mesa / Comanda' },
  { value: 'KIOSK', label: 'Totem / Kiosk' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'MARKETPLACE', label: 'Marketplace' },
];

type DashboardView = 'executive' | 'sales' | 'operations' | 'delivery' | 'menu' | 'team';

const dashboardTabs: Array<{ key: DashboardView; label: string; description: string }> = [
  { key: 'executive', label: 'Executivo', description: 'receita, ticket, margem e DRE' },
  { key: 'sales', label: 'Vendas', description: 'periodo, canal, produto e ticket' },
  { key: 'operations', label: 'Operacional', description: 'status, picos, atrasos e fila' },
  { key: 'delivery', label: 'Delivery', description: 'canais, taxas e SLA de entrega' },
  { key: 'menu', label: 'Cardapio', description: 'produtos, CMV e margem' },
  { key: 'team', label: 'Equipe', description: 'operadores e garcons' },
];

const statusOptions = ['Todos status', 'Pendente', 'Em preparo', 'Pronto', 'Saiu para entrega', 'Finalizado', 'Cancelado'];
const orderTypeOptions = ['Todos tipos', 'Balcao', 'Mesa/Comanda', 'Delivery', 'Retirada'];

export default function AdminReportsPage() {
  const searchParams = useSearchParams();
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [channel, setChannel] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportsOverview | null>(null);
  const [previousReport, setPreviousReport] = useState<ReportsOverview | null>(null);
  const [inventory, setInventory] = useState<ReportsInventory | null>(null);
  const [cmv, setCmv] = useState<ReportsCmv | null>(null);
  const [waiters, setWaiters] = useState<ReportsWaiter | null>(null);
  const [abcStock, setAbcStock] = useState<ReportsAbcStockItems | null>(null);
  const [abcProducts, setAbcProducts] = useState<ReportsAbcProducts | null>(null);
  const [dashboard, setDashboard] = useState<DashboardView>('executive');
  const [orderType, setOrderType] = useState('Todos tipos');
  const [statusFilter, setStatusFilter] = useState('Todos status');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [operatorFilter, setOperatorFilter] = useState('');
  const [waiterFilter, setWaiterFilter] = useState('');
  const [courierFilter, setCourierFilter] = useState('');

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const params = { from, to, branchId, channel };
      const previousPeriod = getPreviousPeriod(from, to);
      const previousParams = { from: previousPeriod.from, to: previousPeriod.to, branchId, channel };
      const [result, previousResult, inventoryResult, cmvResult, waiterResult, abcStockResult, abcProductsResult] = await Promise.all([
        getReportsOverview(params),
        getReportsOverview(previousParams).catch(() => null),
        getReportsInventory(params).catch(() => null),
        getReportsCmv(params).catch(() => null),
        getReportsByWaiter(params).catch(() => null),
        getReportsAbcStockItems(params).catch(() => null),
        getReportsAbcProducts(params).catch(() => null),
      ]);
      setReport(result);
      setPreviousReport(previousResult);
      setInventory(inventoryResult);
      setCmv(cmvResult);
      setWaiters(waiterResult);
      setAbcStock(abcStockResult);
      setAbcProducts(abcProductsResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar relatorios.');
      setPreviousReport(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = searchParams.get('view');
    const views: Record<string, DashboardView> = {
      dashboard: 'executive',
      executive: 'executive',
      sales: 'sales',
      operations: 'operations',
      delivery: 'delivery',
      menu: 'menu',
      'abc-stock': 'menu',
      'abc-products': 'menu',
      team: 'team',
    };
    if (view && views[view]) setDashboard(views[view]);
  }, [searchParams]);

  function onApplyPeriod(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  function exportCsv() {
    if (!report) return;
    const rows = buildExportRows(report, inventory, cmv, waiters, abcStock, abcProducts);
    const csv = rows.map((row) => row.map(escapeCsv).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `menuhub-bi-${from}-${to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const trend = useMemo(() => calculateTrend(report?.charts.salesByDay ?? []), [report]);
  const dashboardHealth = useMemo(() => buildDashboardHealth(report, inventory, cmv, waiters), [report, inventory, cmv, waiters]);
  const hasAdvancedFilter = Boolean(
    orderType !== 'Todos tipos' ||
    statusFilter !== 'Todos status' ||
    categoryFilter.trim() ||
    productFilter.trim() ||
    operatorFilter.trim() ||
    waiterFilter.trim() ||
    courierFilter.trim(),
  );

  if (loading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Carregando BI operacional..." />
      </main>
    );
  }

  const summary = report?.summary;
  const financial = report?.financial;

  return (
    <main className={styles.page}>
      <PageHeader
        title="Relatorios BI"
        subtitle="Indicadores operacionais, vendas, financeiro, estoque, CMV e desempenho por equipe."
        right={
          <div className={styles.headerSummary}>
          <div>
            <span>Periodo</span>
            <strong>{formatDate(from)} - {formatDate(to)}</strong>
          </div>
          <div>
            <span>Pedidos</span>
            <strong>{summary?.totalOrders ?? '-'}</strong>
          </div>
          <Button onClick={exportCsv} disabled={!report}>Export CSV</Button>
          <Button onClick={() => window.print()}>Imprimir/PDF</Button>
          <Button onClick={() => void load()}>Atualizar</Button>
        </div>
        }
      />

      <Card className={styles.toolbarCard}>
        <form className={styles.toolbar} onSubmit={onApplyPeriod}>
          <div className={styles.toolbarTitle}>
            <strong>Filtros</strong>
            <span>Periodo consolidado pelo backend</span>
          </div>
          <label className={styles.field}>
            <span>Inicio</span>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Fim</span>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Canal</span>
            <select className={styles.select} value={channel} onChange={(event) => setChannel(event.target.value)}>
              {channelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Tipo pedido</span>
            <select className={styles.select} value={orderType} onChange={(event) => setOrderType(event.target.value)}>
              {orderTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Status</span>
            <select className={styles.select} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Categoria</span>
            <Input value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} placeholder="Opcional" />
          </label>
          <label className={styles.field}>
            <span>Produto</span>
            <Input value={productFilter} onChange={(event) => setProductFilter(event.target.value)} placeholder="Opcional" />
          </label>
          <label className={styles.field}>
            <span>Operador</span>
            <Input value={operatorFilter} onChange={(event) => setOperatorFilter(event.target.value)} placeholder="Opcional" />
          </label>
          <label className={styles.field}>
            <span>Garcom</span>
            <Input value={waiterFilter} onChange={(event) => setWaiterFilter(event.target.value)} placeholder="Opcional" />
          </label>
          <label className={styles.field}>
            <span>Entregador</span>
            <Input value={courierFilter} onChange={(event) => setCourierFilter(event.target.value)} placeholder="Opcional" />
          </label>
          <Button type="submit" variant="primary">
            Aplicar periodo
          </Button>
          {report ? <span className={styles.generated}>Atualizado em {formatDateTime(report.generatedAt)}</span> : null}
        </form>
        {hasAdvancedFilter ? (
          <div className={styles.filterNote}>
            <Badge tone="warning">Filtro avancado local</Badge>
            <span>Os filtros extras ficam visiveis para a operacao e serao aplicados integralmente quando os endpoints BI granulares forem conectados.</span>
          </div>
        ) : null}
      </Card>

      <section className={styles.dashboardTabs}>
        {dashboardTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={dashboard === tab.key ? styles.dashboardTabActive : styles.dashboardTab}
            onClick={() => setDashboard(tab.key)}
          >
            <strong>{tab.label}</strong>
            <span>{tab.description}</span>
          </button>
        ))}
      </section>

      {error ? (
        <Card className={styles.errorCard}>
          <Badge tone="danger">Erro</Badge>
          <span>{error}</span>
        </Card>
      ) : null}

      {!report ? (
        <Card className={styles.panel}>
          <EmptyState title="Sem dados carregados" description="Aplique um periodo para consultar os indicadores." />
        </Card>
      ) : null}

      {report ? (
        <>
          <DashboardFocusPanel
            active={dashboard}
            report={report}
            inventory={inventory}
            cmv={cmv}
            waiters={waiters}
            trend={trend}
            health={dashboardHealth}
          />

          {dashboard === 'sales' ? (
            <SalesAnalysisOverview report={report} previousReport={previousReport} waiters={waiters} />
          ) : (
            <>
              <section className={styles.kpiGrid}>
                <MetricCard title="Pedidos" value={String(summary?.totalOrders ?? 0)} hint="Total no periodo" />
                <MetricCard title="Faturamento" value={money(summary?.netRevenue ?? 0)} hint="Receita liquida estimada" />
                <MetricCard title="Ticket medio" value={money(summary?.averageTicket ?? 0)} hint="Media por pedido" />
                <MetricCard title="Conclusao" value={percent(summary?.completionRate ?? 0)} hint="Pedidos entregues/finalizados" />
                <MetricCard title="Cancelamento" value={percent(summary?.cancelRate ?? 0)} hint={`${summary?.canceledOrders ?? 0} pedidos`} />
                <MetricCard title="Atrasados" value={String(summary?.delayedOrders ?? 0)} hint="Mais de 30 min em preparo" />
              </section>

              <section className={styles.fullWidth}>
                <ReportPanel title="Evolucao diaria" description={`${formatDate(report.period.from)} a ${formatDate(report.period.to)}`}>
                  <SalesChart rows={report.charts.salesByDay} />
                </ReportPanel>
              </section>

              <section className={styles.twoColumns}>
                <ReportPanel title="Vendas por canal" description="Origem dos pedidos e participacao no faturamento.">
                  <RankedList rows={report.breakdowns.channels} valueKey="orders" amountKey="revenue" />
                </ReportPanel>

                <ReportPanel title="Status dos pedidos" description="Fila operacional consolidada no backend.">
                  <RankedList rows={report.breakdowns.statuses} valueKey="orders" amountKey="revenue" />
                </ReportPanel>
              </section>

              <section className={styles.twoColumns}>
                <ReportPanel title="Horarios de pico" description="Concentracao de pedidos por hora do dia.">
                  <PeakHoursGrid rows={report.charts.peakHours} />
                </ReportPanel>

                <ReportPanel title="Pagamentos" description="Status e metodos registrados nos pedidos.">
                  <RankedList rows={report.breakdowns.paymentStatuses} valueKey="orders" amountKey="revenue" />
                  <div className={styles.divider} />
                  <RankedList rows={report.breakdowns.paymentMethods} valueKey="payments" amountKey="amount" />
                </ReportPanel>
              </section>

              <section className={styles.twoColumns}>
                <TopProducts rows={report.rankings.topProducts} />
                <OperatorRanking rows={report.rankings.operators} />
              </section>

              <section className={styles.twoColumns}>
                <ReportPanel title="Filiais" description="Comparativo por unidade no periodo.">
                  <BranchRanking rows={report.breakdowns.branches} />
                </ReportPanel>

                <ReportPanel title="Financeiro" description="DRE, fluxo e conciliacao exibidos apenas com permissao financeira.">
                  <FinancePanel report={report} />
                </ReportPanel>
              </section>

              <section className={styles.twoColumns}>
                <InventoryPanel inventory={inventory} />
                <CmvPanel cmv={cmv} />
              </section>

              <section className={styles.twoColumns}>
                <AbcStockPanel abcStock={abcStock} />
                <AbcProductsPanel abcProducts={abcProducts} />
              </section>

              <section className={styles.twoColumns}>
                <WaiterRanking waiters={waiters} />
                <ReportPanel title="Cobertura BI" description="Blocos 155 a 166 e 200 ativos no backend DEV.">
                  <div className={styles.coverageGrid}>
                    {['Operacional', 'Dashboard', 'Vendas por periodo', 'Vendas por canal', 'Produtos', 'Ticket medio', 'Picos', 'Estoque', 'CMV', 'ABC Insumos', 'ABC Produtos', 'Financeiro', 'Filiais', 'Operadores', 'Garcons'].map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                </ReportPanel>
              </section>

              {financial?.allowed ? (
                <section className={styles.twoColumns}>
                  <BreakdownPanel title="Categorias financeiras" rows={financial.breakdowns.categories} />
                  <BreakdownPanel title="Centros de custo" rows={financial.breakdowns.costCenters} />
                </section>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </main>
  );
}

function DashboardFocusPanel({
  active,
  report,
  inventory,
  cmv,
  waiters,
  trend,
  health,
}: {
  active: DashboardView;
  report: ReportsOverview;
  inventory: ReportsInventory | null;
  cmv: ReportsCmv | null;
  waiters: ReportsWaiter | null;
  trend: ReturnType<typeof calculateTrend>;
  health: ReturnType<typeof buildDashboardHealth>;
}) {
  const financial = report.financial;
  const summary = report.summary;
  const topChannel = report.breakdowns.channels[0];
  const topStatus = report.breakdowns.statuses[0];
  const peakHour = [...report.charts.peakHours].sort((a, b) => b.orders - a.orders)[0];
  const topProduct = report.rankings.topProducts[0];
  const topOperator = report.rankings.operators[0];
  const topWaiter = waiters?.items[0];
  const deliveryRows = report.breakdowns.channels.filter((row) => /delivery|web|marketplace|whatsapp/i.test(row.label));
  const deliveryRevenue = deliveryRows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
  const deliveryOrders = deliveryRows.reduce((sum, row) => sum + Number(row.orders ?? 0), 0);

  const content: Record<DashboardView, Array<{ title: string; value: string; hint: string; tone?: 'default' | 'success' | 'warning' | 'danger' }>> = {
    executive: [
      { title: 'Receita liquida', value: money(summary.netRevenue), hint: `Tendencia ${trend.label}`, tone: trend.delta >= 0 ? 'success' : 'warning' },
      { title: 'Margem bruta', value: financial.dre ? percent(financial.dre.grossMarginPercent) : percent(cmv?.summary.grossMarginPercent ?? 0), hint: 'DRE/CMV consolidado' },
      { title: 'CMV', value: money(financial.dre?.cogs ?? cmv?.summary.cogs ?? 0), hint: health.cmvStatus, tone: cmv?.cmvStatus === 'PARTIAL_DATA' ? 'warning' : 'default' },
      { title: 'Lucro operacional', value: money(financial.dre?.operatingProfit ?? 0), hint: financial.allowed ? 'Financeiro permitido' : 'Financeiro restrito', tone: financial.allowed ? 'success' : 'warning' },
    ],
    sales: [
      { title: 'Vendas no periodo', value: String(summary.totalOrders), hint: `${summary.completedOrders} finalizadas` },
      { title: 'Faturamento', value: money(summary.netRevenue), hint: 'Receita liquida estimada' },
      { title: 'Ticket medio', value: money(summary.averageTicket), hint: `${percent(summary.completionRate)} conclusao` },
      { title: 'Canal lider', value: topChannel?.label ?? '-', hint: topChannel ? `${topChannel.orders ?? 0} pedidos` : 'Sem vendas' },
    ],
    operations: [
      { title: 'Pedidos ativos', value: String(summary.activeOrders), hint: 'Fila operacional agora' },
      { title: 'Atrasados', value: String(summary.delayedOrders), hint: 'Mais de 30 min em preparo', tone: summary.delayedOrders > 0 ? 'danger' : 'success' },
      { title: 'Pico do dia', value: peakHour?.label ?? '-', hint: peakHour ? `${peakHour.orders} pedidos` : 'Sem pico no periodo' },
      { title: 'Status dominante', value: topStatus?.label ?? '-', hint: topStatus ? `${topStatus.orders ?? 0} pedidos` : 'Sem status' },
    ],
    delivery: [
      { title: 'Pedidos delivery', value: String(deliveryOrders), hint: 'Web, WhatsApp e marketplace' },
      { title: 'Receita delivery', value: money(deliveryRevenue), hint: topChannel ? `Canal lider: ${topChannel.label}` : 'Sem canais' },
      { title: 'Taxa media', value: money(summary.totalOrders ? summary.deliveryFee / summary.totalOrders : 0), hint: 'Taxa de entrega / pedidos' },
      { title: 'SLA entrega', value: summary.delayedOrders > 0 ? 'Atencao' : 'No prazo', hint: `${summary.delayedOrders} pedidos atrasados`, tone: summary.delayedOrders > 0 ? 'warning' : 'success' },
    ],
    menu: [
      { title: 'Produto lider', value: topProduct?.name ?? '-', hint: topProduct ? `${formatQty(topProduct.quantity)} vendidos` : 'Sem venda' },
      { title: 'Margem produto lider', value: topProduct ? percent(topProduct.grossMarginPercent) : '-', hint: topProduct ? money(topProduct.grossMargin) : 'Sem margem' },
      { title: 'Produtos com prejuizo', value: String(cmv?.summary.lossMakingProducts ?? 0), hint: 'Prioridade de preco/ficha', tone: (cmv?.summary.lossMakingProducts ?? 0) > 0 ? 'danger' : 'success' },
      { title: 'Estoque critico', value: String(inventory?.summary.criticalItems ?? 0), hint: health.inventoryStatus, tone: (inventory?.summary.criticalItems ?? 0) > 0 ? 'warning' : 'success' },
    ],
    team: [
      { title: 'Operador lider', value: topOperator?.name ?? '-', hint: topOperator ? `${topOperator.orders} pedidos` : 'Sem operador' },
      { title: 'Venda operador', value: money(topOperator?.revenue ?? 0), hint: 'Ranking por usuario' },
      { title: 'Garcom lider', value: topWaiter?.name ?? '-', hint: topWaiter ? `${topWaiter.orders} pedidos` : 'Sem garcom' },
      { title: 'Receita garcom', value: money(topWaiter?.revenue ?? 0), hint: `${waiters?.items.length ?? 0} garcons no ranking` },
    ],
  };

  return (
    <Card className={styles.focusPanel}>
      <div className={styles.focusHeader}>
        <div>
          <span>Dashboard {dashboardTabs.find((tab) => tab.key === active)?.label}</span>
          <strong>{dashboardTabs.find((tab) => tab.key === active)?.description}</strong>
        </div>
        <Badge tone={health.ready ? 'success' : 'warning'}>{health.ready ? 'Dados completos' : 'Dados parciais'}</Badge>
      </div>
      <div className={styles.focusGrid}>
        {content[active].map((item) => <FocusCard key={item.title} {...item} />)}
      </div>
    </Card>
  );
}

function SalesAnalysisOverview({
  report,
  previousReport,
  waiters,
}: {
  report: ReportsOverview;
  previousReport: ReportsOverview | null;
  waiters: ReportsWaiter | null;
}) {
  const summary = report.summary;
  const previousSummary = previousReport?.summary ?? null;
  const hours = Array.from({ length: 24 }, (_, hour) => {
    const found = report.charts.peakHours.find((row) => Number(row.hour) === hour);
    return found ?? { hour, label: `${String(hour).padStart(2, '0')}h`, orders: 0, revenue: 0, averageTicket: 0 };
  });
  const maxRevenue = Math.max(1, ...hours.map((row) => Number(row.revenue ?? 0)));
  const paymentRows = report.breakdowns.paymentMethods;
  const operatorRows = report.rankings.operators;
  const waiterRows = waiters?.items ?? [];
  const neighborhoodRows = report.breakdowns.neighborhoods ?? [];
  const productRows = report.rankings.topProducts ?? [];
  const revenueTrend = compareValues(summary.netRevenue, previousSummary?.netRevenue ?? 0);
  const ordersTrend = compareValues(summary.totalOrders, previousSummary?.totalOrders ?? 0);
  const ticketTrend = compareValues(summary.averageTicket, previousSummary?.averageTicket ?? 0);
  const details = [
    { label: 'Total dos produtos', value: money(summary.subtotal ?? Math.max(0, summary.grossRevenue - summary.deliveryFee - (summary.extraFee ?? 0))) },
    { label: 'Taxas de entrega', value: money(summary.deliveryFee) },
    { label: 'Taxas adicionais', value: money(summary.extraFee ?? 0) },
    { label: 'Total de descontos', value: money(summary.discount) },
    { label: 'Faturamento', value: money(summary.netRevenue), strong: true },
  ];

  return (
    <section className={styles.salesAnalysis}>
      <div className={styles.analysisTopbar}>
        <div>
          <span>Analise de vendas</span>
          <strong>{formatDate(report.period.from)} - {formatDate(report.period.to)}</strong>
        </div>
        <Badge tone={summary.totalOrders > 0 ? 'success' : 'warning'}>
          {summary.totalOrders > 0 ? 'Com vendas' : 'Sem vendas'}
        </Badge>
      </div>

      <div className={styles.analysisKpis}>
        <AnalysisKpi title="Faturamento" value={money(summary.netRevenue)} hint="Receita liquida" trend={revenueTrend} />
        <AnalysisKpi title="Pedidos" value={String(summary.totalOrders)} hint={`${summary.completedOrders} finalizados`} trend={ordersTrend} />
        <AnalysisKpi title="Ticket medio" value={money(summary.averageTicket)} hint={`${percent(summary.completionRate)} conclusao`} trend={ticketTrend} />
      </div>

      <div className={styles.analysisGrid}>
        <Card className={styles.analysisChartCard}>
          <div className={styles.analysisCardHeader}>
            <div>
              <strong>Faturamento por hora</strong>
              <span>Picos de venda no periodo selecionado</span>
            </div>
            <span>{hours.reduce((sum, row) => sum + row.orders, 0)} pedidos</span>
          </div>
          <div className={styles.hourChart}>
            {hours.map((row) => {
              const height = Math.max(3, (Number(row.revenue ?? 0) / maxRevenue) * 100);
              return (
                <div className={styles.hourColumn} key={row.label} title={`${row.label}: ${money(row.revenue)} / ${row.orders} pedidos`}>
                  <span style={{ '--height': `${height}%` } as CSSProperties} />
                  <small>{row.label.replace('h', '')}</small>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className={styles.analysisDetailsCard}>
          <div className={styles.analysisCardHeader}>
            <div>
              <strong>Detalhes do faturamento</strong>
              <span>Composicao financeira do periodo</span>
            </div>
          </div>
          <div className={styles.revenueDetails}>
            {details.map((item) => (
              <div key={item.label} className={item.strong ? styles.revenueDetailStrong : styles.revenueDetail}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className={styles.analysisTables}>
        <AnalysisTable
          title="Pedidos por forma de pagamento"
          empty="Nenhum pagamento encontrado."
          columns={['Forma de pagamento', 'Faturamento', 'Pedidos', 'Ticket medio']}
          rows={paymentRows.map((row) => [
            row.label,
            money(Number(row.amount ?? row.revenue ?? 0)),
            String(row.payments ?? row.orders ?? 0),
            money((Number(row.amount ?? row.revenue ?? 0)) / Math.max(1, Number(row.payments ?? row.orders ?? 0))),
          ])}
        />
        <AnalysisTable
          title="Produtos vendidos"
          empty="Nenhum produto vendido no periodo."
          columns={['Produto', 'Qtd', 'Faturamento', 'CMV', 'Margem']}
          rows={productRows.map((row) => [
            row.name,
            formatQty(row.quantity),
            money(row.revenue),
            money(row.cogs),
            percent(row.grossMarginPercent),
          ])}
        />
        <AnalysisTable
          title="Pedidos por operador"
          empty="Nenhum operador encontrado."
          columns={['Funcionario', 'Faturamento', 'Pedidos']}
          rows={operatorRows.map((row) => [row.name, money(row.revenue), String(row.orders)])}
        />
        <AnalysisTable
          title="Pedidos por garcom"
          empty="Nenhum garcom encontrado."
          columns={['Funcionario', 'Faturamento', 'Pedidos']}
          rows={waiterRows.map((row) => [row.name, money(row.revenue), String(row.orders)])}
        />
        <AnalysisTable
          title="Pedidos por bairro"
          empty="Nenhum bairro de delivery encontrado."
          columns={['Bairro', 'Faturamento', 'Pedidos', 'Ticket medio', 'Taxa media']}
          rows={neighborhoodRows.map((row: NeighborhoodRankingRow) => [
            row.label,
            money(row.revenue),
            String(row.orders),
            money(row.averageTicket),
            money(row.averageDeliveryFee),
          ])}
        />
      </div>
    </section>
  );
}

function AnalysisKpi({
  title,
  value,
  hint,
  trend,
}: {
  title: string;
  value: string;
  hint: string;
  trend?: ReturnType<typeof compareValues>;
}) {
  return (
    <div className={styles.analysisKpi}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
      {trend ? (
        <em className={trend.delta >= 0 ? styles.trendUp : styles.trendDown}>
          {trend.label} periodo anterior
        </em>
      ) : null}
    </div>
  );
}

function AnalysisTable({ title, columns, rows, empty }: { title: string; columns: string[]; rows: string[][]; empty: string }) {
  return (
    <Card className={styles.analysisTableCard}>
      <div className={styles.analysisCardHeader}>
        <div>
          <strong>{title}</strong>
          <span>{rows.length} registros</span>
        </div>
      </div>
      <div className={styles.analysisTableWrap}>
        <table className={styles.analysisTable}>
          <thead>
            <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.slice(0, 8).map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {row.map((cell, cellIndex) => <td key={`${title}-${index}-${cellIndex}`}>{cell}</td>)}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className={styles.analysisEmpty}>{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FocusCard({ title, value, hint, tone = 'default' }: { title: string; value: string; hint: string; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  return (
    <div className={`${styles.focusCard} ${styles[`focus_${tone}`]}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function InventoryPanel({ inventory }: { inventory: ReportsInventory | null }) {
  return (
    <ReportPanel title="Estoque" description="Saldo, itens criticos e movimentacoes com dados parciais quando necessario.">
      {!inventory ? (
        <EmptyState title="Estoque indisponivel" description="O usuario atual pode nao possuir permissao de estoque." />
      ) : (
        <div className={styles.panelStack}>
          <div className={styles.financeGrid}>
            <MiniLine label="Itens ativos" value={String(inventory.summary.itemsCount)} />
            <MiniLine label="Estoque baixo" value={String(inventory.summary.lowStockItems)} danger={inventory.summary.lowStockItems > 0} />
            <MiniLine label="Criticos" value={String(inventory.summary.criticalItems)} danger={inventory.summary.criticalItems > 0} />
            <MiniLine label="Valor estimado" value={money(inventory.summary.estimatedStockValue)} />
            <MiniLine label="Status" value={inventory.dataStatus === 'READY' ? 'Completo' : 'Parcial'} />
            <MiniLine label="Movimentacoes" value={String(inventory.movements.reduce((sum, row) => sum + row.count, 0))} />
          </div>

          <div className={styles.reportSection}>
            <div className={styles.sectionHeader}>
              <strong>Estoque critico</strong>
              <span>{inventory.lowStockRanking.length} itens monitorados</span>
            </div>
            {inventory.lowStockRanking.length ? (
              <div className={styles.compactList}>
                {inventory.lowStockRanking.slice(0, 6).map((row) => (
                  <div className={styles.inventoryRow} key={row.stockItemId}>
                    <div>
                      <strong>{row.name}</strong>
                      <small>Minimo {formatQty(row.minimumQuantity)} {row.unit ?? ''}</small>
                    </div>
                    <span className={row.critical ? styles.statusDanger : styles.statusNeutral}>
                      Atual {formatQty(row.currentQuantity)} {row.unit ?? ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Sem ruptura critica" description="Itens abaixo do minimo aparecem aqui." />
            )}
          </div>

          <div className={styles.reportSection}>
            <div className={styles.sectionHeader}>
              <strong>Sugestao de compra</strong>
              <span>Baseada em minimo e ponto de reposicao</span>
            </div>
            {inventory.purchaseSuggestions.length ? (
              <div className={styles.compactList}>
                {inventory.purchaseSuggestions.slice(0, 6).map((row) => (
                  <div className={styles.inventoryRow} key={row.stockItemId}>
                    <div>
                      <strong>{row.name}</strong>
                      <small>{row.category ?? 'Sem categoria'} - alvo {formatQty(Math.max(row.minimumQuantity, row.reorderPoint))} {row.unit ?? ''}</small>
                    </div>
                    <div className={styles.rightStack}>
                      <b>{formatQty(row.suggestedQuantity)} {row.unit ?? ''}</b>
                      <small>{money(row.estimatedPurchaseCost)}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Sem compra sugerida" description="Quando o saldo ficar abaixo do ponto de reposicao, a sugestao aparece aqui." />
            )}
          </div>
        </div>
      )}
    </ReportPanel>
  );
}

function CmvPanel({ cmv }: { cmv: ReportsCmv | null }) {
  return (
    <ReportPanel title="CMV e margem" description="Custo da mercadoria vendida baseado nos custos disponiveis dos itens.">
      {!cmv ? (
        <EmptyState title="CMV indisponivel" description="O usuario atual pode nao possuir permissao de custo/financeiro." />
      ) : (
        <div className={styles.panelStack}>
          <div className={styles.financeGrid}>
            <MiniLine label="Vendas brutas" value={money(cmv.summary.grossSales)} />
            <MiniLine label="CMV" value={money(cmv.summary.cogs)} />
            <MiniLine label="Margem bruta" value={`${money(cmv.summary.grossMargin)} (${percent(cmv.summary.grossMarginPercent)})`} />
            <MiniLine label="Produtos com prejuizo" value={String(cmv.summary.lossMakingProducts)} danger={cmv.summary.lossMakingProducts > 0} />
            <MiniLine label="Sem custo" value={String(cmv.summary.productsWithoutCost)} danger={cmv.summary.productsWithoutCost > 0} />
            <MiniLine label="Status" value={cmv.cmvStatus === 'READY' ? 'Completo' : 'Dados parciais'} danger={cmv.cmvStatus !== 'READY'} />
          </div>

          {cmv.notes.length ? (
            <div className={styles.noticeList}>
              {cmv.notes.slice(0, 3).map((note) => (
                <span key={note}>{note}</span>
              ))}
            </div>
          ) : null}

          <div className={styles.reportSection}>
            <div className={styles.sectionHeader}>
              <strong>CMV por categoria</strong>
              <span>{cmv.summary.categories} categorias</span>
            </div>
            {cmv.categories.length ? (
              <div className={styles.compactList}>
                {cmv.categories.slice(0, 6).map((row) => (
                  <div className={styles.inventoryRow} key={row.categoryId ?? row.categoryName}>
                    <div>
                      <strong>{row.categoryName}</strong>
                      <small>{row.products} produtos - {formatQty(row.quantity)} vendidos</small>
                    </div>
                    <div className={styles.rightStack}>
                      <b>{percent(row.grossMarginPercent)}</b>
                      <small>CMV {money(row.cogs)}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Sem categorias no periodo" description="As categorias aparecem quando houver venda com produto vinculado." />
            )}
          </div>

          <div className={styles.reportSection}>
            <div className={styles.sectionHeader}>
              <strong>Produtos por margem</strong>
              <span>{cmv.summary.products} produtos vendidos</span>
            </div>
            {cmv.products.length ? (
              <div className={styles.compactList}>
                {cmv.products.slice(0, 8).map((row) => (
                  <div className={styles.inventoryRow} key={`${row.productId ?? row.name}-${row.rank}`}>
                    <div>
                      <strong>{row.name}</strong>
                      <small>{row.categoryName} - custo medio {money(row.averageUnitCost)}</small>
                    </div>
                    <div className={styles.rightStack}>
                      <b>{money(row.grossMargin)}</b>
                      <small>{percent(row.grossMarginPercent)} margem</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Sem produtos vendidos" description="Produtos com ficha tecnica alimentam o CMV real." />
            )}
          </div>

          {cmv.lossMaking.length ? (
            <div className={styles.reportSection}>
              <div className={styles.sectionHeader}>
                <strong>Produtos com prejuizo</strong>
                <span>Prioridade de revisao</span>
              </div>
              <div className={styles.compactList}>
                {cmv.lossMaking.map((row) => (
                  <div className={styles.inventoryRow} key={`${row.productId ?? row.name}-loss`}>
                    <div>
                      <strong>{row.name}</strong>
                      <small>Venda {money(row.revenue)} - CMV {money(row.cogs)}</small>
                    </div>
                    <span className={styles.statusDanger}>{money(row.grossMargin)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </ReportPanel>
  );
}

function AbcStockPanel({ abcStock }: { abcStock: ReportsAbcStockItems | null }) {
  return (
    <ReportPanel title="ABC Insumos" description="Curva de compras confirmadas por insumo no periodo.">
      {!abcStock ? (
        <EmptyState title="ABC de insumos indisponivel" description="Confirme compras ou verifique permissao de estoque/relatorios." />
      ) : abcStock.items.length ? (
        <div className={styles.panelStack}>
          <div className={styles.financeGrid}>
            <MiniLine label="Total comprado" value={money(abcStock.summary.totalPurchased)} />
            <MiniLine label="Insumos" value={String(abcStock.summary.items)} />
            <MiniLine label="Classe A" value={String(abcStock.summary.classA)} />
            <MiniLine label="Classe B" value={String(abcStock.summary.classB)} />
            <MiniLine label="Classe C" value={String(abcStock.summary.classC)} />
          </div>
          <div className={styles.compactList}>
            {abcStock.items.slice(0, 10).map((row) => (
              <div className={styles.inventoryRow} key={row.stockItemId}>
                <div>
                  <strong>{row.name}</strong>
                  <small>{row.categoryName} - {formatQty(row.quantity)} {row.unit ?? ''} comprados</small>
                  <small>{row.suggestedAction}</small>
                </div>
                <div className={styles.rightStack}>
                  <Badge tone={abcTone(row.abcClass)}>Classe {row.abcClass}</Badge>
                  <b>{money(row.totalPurchased)}</b>
                  <small>{percent(row.percent)} do total</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState title="Sem compras no periodo" description="A curva ABC usa recebimentos e notas fiscais confirmadas." />
      )}
    </ReportPanel>
  );
}

function AbcProductsPanel({ abcProducts }: { abcProducts: ReportsAbcProducts | null }) {
  return (
    <ReportPanel title="ABC Produtos" description="Curva de receita por produto, margem e acao sugerida.">
      {!abcProducts ? (
        <EmptyState title="ABC de produtos indisponivel" description="Registre vendas ou verifique permissao de relatorios." />
      ) : abcProducts.items.length ? (
        <div className={styles.panelStack}>
          <div className={styles.financeGrid}>
            <MiniLine label="Receita" value={money(abcProducts.summary.revenue)} />
            <MiniLine label="Produtos" value={String(abcProducts.summary.products)} />
            <MiniLine label="Classe A" value={String(abcProducts.summary.classA)} />
            <MiniLine label="Classe B" value={String(abcProducts.summary.classB)} />
            <MiniLine label="Classe C" value={String(abcProducts.summary.classC)} />
          </div>
          <div className={styles.compactList}>
            {abcProducts.items.slice(0, 10).map((row) => (
              <div className={styles.inventoryRow} key={`${row.productId ?? row.name}-${row.rank}`}>
                <div>
                  <strong>{row.name}</strong>
                  <small>{row.categoryName} - {formatQty(row.quantity)} vendidos</small>
                  <small>{row.suggestedAction}</small>
                </div>
                <div className={styles.rightStack}>
                  <Badge tone={abcTone(row.abcClass)}>Classe {row.abcClass}</Badge>
                  <b>{money(row.revenue)}</b>
                  <small>{percent(row.grossMarginPercent)} margem</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState title="Sem vendas no periodo" description="A curva ABC aparece quando houver pedidos finalizados." />
      )}
    </ReportPanel>
  );
}

function WaiterRanking({ waiters }: { waiters: ReportsWaiter | null }) {
  return (
    <ReportPanel title="Garcons" description="Desempenho por garcom no App Garcom e pedidos de mesa.">
      {!waiters ? (
        <EmptyState title="Relatorio indisponivel" description="Nao foi possivel carregar o ranking de garcons." />
      ) : waiters.items.length ? (
        <div className={styles.productList}>
          {waiters.items.map((row) => (
            <div className={styles.productRow} key={`${row.waiterUserId ?? row.name}-${row.rank}`}>
              <span>{row.rank}</span>
              <strong>{row.name}</strong>
              <small>{row.orders} pedidos</small>
              <b>{money(row.revenue)}</b>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Sem garcons no periodo" description="Pedidos do App Garcom aparecem aqui quando existirem." />
      )}
    </ReportPanel>
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

function SalesChart({ rows }: { rows: SalesByDayRow[] }) {
  if (!rows.length) {
    return <EmptyState title="Sem vendas no periodo" description="Os pontos do grafico aparecem quando houver pedidos." />;
  }

  const width = 760;
  const height = 220;
  const padding = 18;
  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 1);
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const points = rows.map((row, index) => {
    const x = rows.length === 1 ? width / 2 : padding + (index * usableWidth) / (rows.length - 1);
    const y = height - padding - (row.revenue / maxRevenue) * usableHeight;
    return { x, y, row };
  });
  const path = points.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div className={styles.chartWrap}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolucao diaria de vendas">
        <polyline points={path} fill="none" stroke="url(#salesGradient)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <circle key={point.row.date} cx={point.x} cy={point.y} r="5" />
        ))}
        <defs>
          <linearGradient id="salesGradient" x1="0" x2="1" y1="0" y2="0">
            <stop stopColor="#365bff" />
            <stop offset="0.6" stopColor="#7437ef" />
            <stop offset="1" stopColor="#ff9f1c" />
          </linearGradient>
        </defs>
      </svg>
      <div className={styles.chartFooter}>
        <span>{formatDate(rows[0]?.date)}</span>
        <strong>{money(rows.reduce((acc, row) => acc + row.revenue, 0))}</strong>
        <span>{formatDate(rows[rows.length - 1]?.date)}</span>
      </div>
    </div>
  );
}

function RankedList({
  rows,
  valueKey,
  amountKey,
}: {
  rows: ReportBreakdownRow[];
  valueKey: 'orders' | 'payments';
  amountKey: 'revenue' | 'amount';
}) {
  if (!rows.length) {
    return <EmptyState title="Sem dados no periodo" description="Quando houver movimentacao, os indicadores aparecem aqui." />;
  }

  return (
    <div className={styles.rankList}>
      {rows.map((row) => {
        const value = Number(row[valueKey] ?? 0);
        const amount = Number(row[amountKey] ?? 0);
        return (
          <div className={styles.rankRow} key={row.key}>
            <div className={styles.rankTop}>
              <strong>{row.label}</strong>
              <span>
                {value} {value === 1 ? 'registro' : 'registros'} - {money(amount)}
              </span>
            </div>
            <div className={styles.barTrack}>
              <span style={{ width: `${Math.min(100, row.percent)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PeakHoursGrid({ rows }: { rows: PeakHourRow[] }) {
  if (!rows.length) {
    return <EmptyState title="Sem horarios" description="Os horarios de pico dependem dos pedidos do periodo." />;
  }

  const max = Math.max(...rows.map((row) => row.orders), 1);
  return (
    <div className={styles.heatmap}>
      {rows.map((row) => {
        const intensity = Math.max(0.14, row.orders / max);
        return (
          <div className={styles.heatCell} key={row.hour} style={{ '--intensity': intensity } as CSSProperties}>
            <strong>{row.label}</strong>
            <span>{row.orders} pedidos</span>
            <small>{money(row.revenue)}</small>
          </div>
        );
      })}
    </div>
  );
}

function TopProducts({ rows }: { rows: TopProductRow[] }) {
  return (
    <ReportPanel title="Produtos e margem" description="Itens mais vendidos com CMV e margem bruta por produto.">
      {rows.length ? (
        <div className={styles.productList}>
          {rows.map((row) => (
            <div className={styles.productRow} key={`${row.productId ?? row.name}-${row.rank}`}>
              <span>{row.rank}</span>
              <div className={styles.productInfo}>
                <strong>{row.name}</strong>
                <small>{row.quantity.toLocaleString('pt-BR')} un. - {row.orders} pedidos</small>
              </div>
              <div className={styles.productAmounts}>
                <b>{money(row.revenue)}</b>
                <small>CMV {money(row.cogs)} - Margem {money(row.grossMargin)} ({percent(row.grossMarginPercent)})</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Sem produtos vendidos" description="Assim que houver pedidos, o ranking aparece aqui." />
      )}
    </ReportPanel>
  );
}

function OperatorRanking({ rows }: { rows: OperatorRankingRow[] }) {
  return (
    <ReportPanel title="Operadores" description="Pedidos registrados por usuario no periodo.">
      {rows.length ? (
        <div className={styles.productList}>
          {rows.map((row) => (
            <div className={styles.productRow} key={`${row.userId ?? row.name}-${row.rank}`}>
              <span>{row.rank}</span>
              <strong>{row.name}</strong>
              <small>{row.orders} pedidos</small>
              <b>{money(row.revenue)}</b>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Sem operador identificado" description="Pedidos sem usuario vinculado nao entram neste ranking." />
      )}
    </ReportPanel>
  );
}

function BranchRanking({ rows }: { rows: BranchRankingRow[] }) {
  if (!rows.length) {
    return <EmptyState title="Sem filiais no periodo" description="O comparativo aparece quando houver pedidos." />;
  }

  return (
    <div className={styles.rankList}>
      {rows.map((row) => (
        <div className={styles.rankRow} key={row.branchId}>
          <div className={styles.rankTop}>
            <strong>{row.label}</strong>
            <span>{money(row.revenue)}</span>
          </div>
          {row.location ? <small className={styles.muted}>{row.location}</small> : null}
          <div className={styles.barTrack}>
            <span style={{ width: `${Math.min(100, row.percent)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FinancePanel({ report }: { report: ReportsOverview }) {
  const financial = report.financial;
  if (!financial.allowed) {
    return <EmptyState title="Financeiro restrito" description="Este usuario nao possui permissao financeira para DRE e fluxo." />;
  }
  if (financial.error) {
    return <EmptyState title="Financeiro indisponivel" description={financial.error} />;
  }
  const dre = financial.dre;
  const cashFlow = financial.cashFlow;
  return (
    <div className={styles.financeGrid}>
      <MiniLine label="Receita liquida" value={money(dre?.netRevenue ?? 0)} />
      <MiniLine label="CMV" value={money(dre?.cogs ?? 0)} danger={dre?.cogsStatus !== 'READY'} />
      <MiniLine label="Margem bruta" value={`${money(dre?.grossMargin ?? 0)} (${percent(dre?.grossMarginPercent ?? 0)})`} />
      <MiniLine label="Despesas operacionais" value={money(dre?.operatingExpenses ?? 0)} />
      <MiniLine label="Lucro operacional" value={`${money(dre?.operatingProfit ?? 0)} (${percent(dre?.operatingProfitPercent ?? 0)})`} />
      <MiniLine label="Saldo realizado" value={money(cashFlow?.realized.balance ?? 0)} />
      <MiniLine label="Conciliações pendentes" value={String(financial.reconciliationSummary?.pending ?? 0)} danger={(financial.reconciliationSummary?.pending ?? 0) > 0} />
      <MiniLine label="Contas a pagar abertas" value={String(financial.openPayables ?? 0)} />
      <MiniLine label="Contas a receber abertas" value={String(financial.openReceivables ?? 0)} />
    </div>
  );
}

function BreakdownPanel({ title, rows }: { title: string; rows: FinancialBreakdownRow[] }) {
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

function calculateTrend(rows: SalesByDayRow[]) {
  if (rows.length < 2) {
    return { first: 0, last: rows[0]?.revenue ?? 0, delta: 0, percent: 0, label: 'sem comparacao' };
  }
  const middle = Math.max(1, Math.floor(rows.length / 2));
  const first = rows.slice(0, middle).reduce((sum, row) => sum + row.revenue, 0);
  const last = rows.slice(middle).reduce((sum, row) => sum + row.revenue, 0);
  const delta = last - first;
  const trendPercent = first ? (delta / first) * 100 : 0;
  const label = `${delta >= 0 ? '+' : ''}${percent(trendPercent)} vs inicio do periodo`;
  return { first, last, delta, percent: trendPercent, label };
}

function getPreviousPeriod(from: string, to: string) {
  const fromDate = parseDateOnly(from);
  const toDate = parseDateOnly(to);
  const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
  const previousTo = new Date(fromDate);
  previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - days + 1);
  return { from: toDateOnly(previousFrom), to: toDateOnly(previousTo) };
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function compareValues(current: number, previous: number) {
  const delta = Number(current ?? 0) - Number(previous ?? 0);
  if (!previous) {
    return { delta, percent: current > 0 ? 100 : 0, label: current > 0 ? '+100,0%' : '0,0%' };
  }
  const trendPercent = (delta / previous) * 100;
  return { delta, percent: trendPercent, label: `${delta >= 0 ? '+' : ''}${percent(trendPercent)}` };
}

function buildDashboardHealth(
  report: ReportsOverview | null,
  inventory: ReportsInventory | null,
  cmv: ReportsCmv | null,
  waiters: ReportsWaiter | null,
) {
  const inventoryStatus = !inventory ? 'Estoque indisponivel' : inventory.dataStatus === 'READY' ? 'Estoque completo' : 'Estoque parcial';
  const cmvStatus = !cmv ? 'CMV indisponivel' : cmv.cmvStatus === 'READY' ? 'CMV completo' : 'CMV parcial';
  const ready = Boolean(report && inventory?.dataStatus === 'READY' && cmv?.cmvStatus === 'READY' && waiters);
  return { ready, inventoryStatus, cmvStatus };
}

function buildExportRows(
  report: ReportsOverview,
  inventory: ReportsInventory | null,
  cmv: ReportsCmv | null,
  waiters: ReportsWaiter | null,
  abcStock: ReportsAbcStockItems | null,
  abcProducts: ReportsAbcProducts | null,
) {
  const rows: string[][] = [
    ['secao', 'indicador', 'valor_1', 'valor_2', 'valor_3'],
    ['executivo', 'pedidos', String(report.summary.totalOrders), '', ''],
    ['executivo', 'receita_liquida', String(report.summary.netRevenue), '', ''],
    ['executivo', 'ticket_medio', String(report.summary.averageTicket), '', ''],
    ['executivo', 'conclusao_percentual', String(report.summary.completionRate), '', ''],
    ['executivo', 'cancelamento_percentual', String(report.summary.cancelRate), '', ''],
  ];

  report.breakdowns.channels.forEach((row) => rows.push(['canal', row.label, String(row.orders ?? 0), String(row.revenue ?? 0), String(row.percent)]));
  report.breakdowns.statuses.forEach((row) => rows.push(['status', row.label, String(row.orders ?? 0), String(row.revenue ?? 0), String(row.percent)]));
  report.rankings.topProducts.forEach((row) => rows.push(['produto', row.name, String(row.quantity), String(row.revenue), String(row.grossMarginPercent)]));
  report.rankings.operators.forEach((row) => rows.push(['operador', row.name, String(row.orders), String(row.revenue), '']));
  waiters?.items.forEach((row) => rows.push(['garcom', row.name, String(row.orders), String(row.revenue), String(row.averageTicket)]));
  inventory?.purchaseSuggestions.forEach((row) => rows.push(['compra_sugerida', row.name, String(row.suggestedQuantity), row.unit ?? '', String(row.estimatedPurchaseCost)]));
  cmv?.lossMaking.forEach((row) => rows.push(['produto_prejuizo', row.name, String(row.revenue), String(row.cogs), String(row.grossMargin)]));
  abcStock?.items.forEach((row) => rows.push(['abc_insumos', row.name, row.abcClass, String(row.totalPurchased), String(row.percent)]));
  abcProducts?.items.forEach((row) => rows.push(['abc_produtos', row.name, row.abcClass, String(row.revenue), String(row.percent)]));

  return rows;
}

function abcTone(abcClass: 'A' | 'B' | 'C'): 'danger' | 'warning' | 'success' {
  if (abcClass === 'A') return 'danger';
  if (abcClass === 'B') return 'warning';
  return 'success';
}

function escapeCsv(value: string) {
  const escaped = value.replace(/"/g, '""');
  return /[;"\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

function money(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function percent(value: number): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatQty(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function formatDate(value?: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
