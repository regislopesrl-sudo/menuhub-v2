'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import {
  getReportsByWaiter,
  getReportsCmv,
  getReportsInventory,
  getReportsOverview,
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
} from '@/features/reports/reports.api';
import styles from './page.module.css';

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

export default function AdminReportsPage() {
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportsOverview | null>(null);
  const [inventory, setInventory] = useState<ReportsInventory | null>(null);
  const [cmv, setCmv] = useState<ReportsCmv | null>(null);
  const [waiters, setWaiters] = useState<ReportsWaiter | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const params = { from, to, branchId };
      const [result, inventoryResult, cmvResult, waiterResult] = await Promise.all([
        getReportsOverview(params),
        getReportsInventory(params).catch(() => null),
        getReportsCmv(params).catch(() => null),
        getReportsByWaiter(params).catch(() => null),
      ]);
      setReport(result);
      setInventory(inventoryResult);
      setCmv(cmvResult);
      setWaiters(waiterResult);
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
      <header className={styles.reportsHeader}>
        <div className={styles.headerMain}>
          <span className={styles.eyebrow}>MenuHub BI</span>
          <h1>Relatorios BI</h1>
          <p>Indicadores operacionais, vendas, financeiro, estoque, CMV e desempenho por equipe.</p>
        </div>
        <div className={styles.headerSummary}>
          <div>
            <span>Periodo</span>
            <strong>{formatDate(from)} - {formatDate(to)}</strong>
          </div>
          <div>
            <span>Pedidos</span>
            <strong>{summary?.totalOrders ?? '-'}</strong>
          </div>
          <Button onClick={() => window.print()}>Imprimir/PDF</Button>
          <Button onClick={() => void load()}>Atualizar</Button>
        </div>
      </header>

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
          <Button type="submit" variant="primary">
            Aplicar periodo
          </Button>
          {report ? <span className={styles.generated}>Atualizado em {formatDateTime(report.generatedAt)}</span> : null}
        </form>
      </Card>

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
            <WaiterRanking waiters={waiters} />
            <ReportPanel title="Cobertura BI" description="Blocos 155 a 166 e 200 ativos no backend DEV.">
              <div className={styles.coverageGrid}>
                {['Operacional', 'Dashboard', 'Vendas por periodo', 'Vendas por canal', 'Produtos', 'Ticket medio', 'Picos', 'Estoque', 'CMV', 'Financeiro', 'Filiais', 'Operadores', 'Garcons'].map((item) => (
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
      ) : null}
    </main>
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
