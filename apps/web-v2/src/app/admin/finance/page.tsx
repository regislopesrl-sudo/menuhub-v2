'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  createManualFinanceEntry,
  createManualPayable,
  createManualReceivable,
  createFinanceCategory,
  createFinanceCostCenter,
  createFinancialAccount,
  getFinanceReport,
  cancelFinanceAccountRecord,
  cancelFinanceLedger,
  settlePayable,
  settleReceivable,
  type CmvReport,
  type DailyCashFlowRow,
  type ExecutiveAlert,
  type FinanceAccount,
  type FinanceBreakdownItem,
  type FinanceHealth,
  type FinanceLedgerEntry,
  type FinanceOption,
  type FinanceOverview,
  type FinanceReport,
  type FinanceReconciliation,
  type FinancialAccountOption,
  type PaymentFee,
  type ReceivableSchedule,
} from '@/features/finance/finance.api';
import styles from './page.module.css';

type AccountKind = 'PAYABLE' | 'RECEIVABLE';
type FinanceTab = 'summary' | 'dre' | 'cashflow' | 'cmv' | 'accounts' | 'reconciliation' | 'settings' | 'exports';

const tabs: Array<{ key: FinanceTab; label: string }> = [
  { key: 'summary', label: 'Resumo' },
  { key: 'dre', label: 'DRE' },
  { key: 'cashflow', label: 'Fluxo de caixa' },
  { key: 'cmv', label: 'CMV / Margem' },
  { key: 'accounts', label: 'Contas' },
  { key: 'reconciliation', label: 'Conciliacao' },
  { key: 'settings', label: 'Configuracao' },
  { key: 'exports', label: 'Exportacoes' },
];

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

export default function AdminFinancePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FinanceTab>('summary');
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [ledger, setLedger] = useState<FinanceLedgerEntry[]>([]);
  const [payables, setPayables] = useState<FinanceAccount[]>([]);
  const [receivables, setReceivables] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceOption[]>([]);
  const [costCenters, setCostCenters] = useState<FinanceOption[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccountOption[]>([]);
  const [paymentFees, setPaymentFees] = useState<PaymentFee[]>([]);
  const [receivableSchedules, setReceivableSchedules] = useState<ReceivableSchedule[]>([]);
  const [reconciliation, setReconciliation] = useState<FinanceReconciliation | null>(null);

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const [entryType, setEntryType] = useState<'REVENUE' | 'EXPENSE'>('REVENUE');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [entryFinancialAccountId, setEntryFinancialAccountId] = useState('');

  const [accountKind, setAccountKind] = useState<AccountKind>('PAYABLE');
  const [accountAmount, setAccountAmount] = useState('');
  const [accountDescription, setAccountDescription] = useState('');
  const [accountDueDate, setAccountDueDate] = useState(today);
  const [accountCategory, setAccountCategory] = useState('');
  const [accountCostCenter, setAccountCostCenter] = useState('');
  const [accountFinancialAccountId, setAccountFinancialAccountId] = useState('');

  const [settleKind, setSettleKind] = useState<AccountKind>('PAYABLE');
  const [settleAccountId, setSettleAccountId] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState('EXTERNAL');

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<'REVENUE' | 'EXPENSE' | 'BOTH'>('EXPENSE');
  const [newCostCenterName, setNewCostCenterName] = useState('');
  const [newFinancialAccountName, setNewFinancialAccountName] = useState('');
  const [newFinancialAccountType, setNewFinancialAccountType] = useState<FinancialAccountOption['type']>('BANK');

  async function load() {
    setLoading(true);
    setError(null);
    const params = { from, to };
    try {
      const report = await getFinanceReport(params);
      setReport(report);
      setOverview(report.overview);
      setLedger(report.ledger);
      setPayables(report.payables);
      setReceivables(report.receivables);
      setReconciliation(report.reconciliation);
      setCategories(report.categories);
      setCostCenters(report.costCenters);
      setFinancialAccounts(report.financialAccounts ?? []);
      setPaymentFees(report.paymentFees ?? []);
      setReceivableSchedules(report.receivableSchedules ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar financeiro.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreateEntry(event: FormEvent) {
    event.preventDefault();
    const value = parsePositiveAmount(amount);
    if (!value) {
      setError('Valor do lancamento deve ser maior que zero.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createManualFinanceEntry({
        entryType,
        amount: value,
        description: description || undefined,
        category: category || undefined,
        costCenter: costCenter || undefined,
        financialAccountId: entryFinancialAccountId || undefined,
      });
      setAmount('');
      setDescription('');
      setCategory('');
      setCostCenter('');
      setEntryFinancialAccountId('');
      setNotice('Lancamento manual criado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar lancamento.');
    } finally {
      setSaving(false);
    }
  }

  async function onCreateAccount(event: FormEvent) {
    event.preventDefault();
    const value = parsePositiveAmount(accountAmount);
    if (!value) {
      setError('Valor da conta deve ser maior que zero.');
      return;
    }
    if (!accountDescription.trim()) {
      setError('Descricao da conta e obrigatoria.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = {
        amount: value,
        description: accountDescription,
        dueDate: accountDueDate,
        category: accountCategory || undefined,
        costCenter: accountCostCenter || undefined,
        financialAccountId: accountFinancialAccountId || undefined,
      };
      if (accountKind === 'PAYABLE') {
        await createManualPayable(input);
        setNotice('Conta a pagar criada.');
      } else {
        await createManualReceivable(input);
        setNotice('Conta a receber criada.');
      }
      setAccountAmount('');
      setAccountDescription('');
      setAccountDueDate(today);
      setAccountCategory('');
      setAccountCostCenter('');
      setAccountFinancialAccountId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar conta.');
    } finally {
      setSaving(false);
    }
  }

  async function onSettleAccount(event: FormEvent) {
    event.preventDefault();
    const value = parsePositiveAmount(settleAmount);
    if (!settleAccountId) {
      setError('Selecione uma conta para baixar.');
      return;
    }
    if (!value) {
      setError('Valor da baixa deve ser maior que zero.');
      return;
    }
    setSettling(true);
    setError(null);
    try {
      if (settleKind === 'PAYABLE') {
        await settlePayable(settleAccountId, { amount: value, settlementMethod: settleMethod });
        setNotice('Pagamento registrado.');
      } else {
        await settleReceivable(settleAccountId, { amount: value, settlementMethod: settleMethod });
        setNotice('Recebimento registrado.');
      }
      setSettleAccountId('');
      setSettleAmount('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao baixar conta.');
    } finally {
      setSettling(false);
    }
  }

  async function onCreateCategory(event: FormEvent) {
    event.preventDefault();
    if (!newCategoryName.trim()) {
      setError('Nome da categoria financeira e obrigatorio.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createFinanceCategory({ name: newCategoryName, type: newCategoryType });
      setNewCategoryName('');
      setNotice('Categoria financeira criada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar categoria.');
    } finally {
      setSaving(false);
    }
  }

  async function onCreateCostCenter(event: FormEvent) {
    event.preventDefault();
    if (!newCostCenterName.trim()) {
      setError('Nome do centro de custo e obrigatorio.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createFinanceCostCenter({ name: newCostCenterName });
      setNewCostCenterName('');
      setNotice('Centro de custo criado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar centro de custo.');
    } finally {
      setSaving(false);
    }
  }

  async function onCreateFinancialAccount(event: FormEvent) {
    event.preventDefault();
    if (!newFinancialAccountName.trim()) {
      setError('Nome da conta financeira e obrigatorio.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createFinancialAccount({ name: newFinancialAccountName, type: newFinancialAccountType });
      setNewFinancialAccountName('');
      setNotice('Conta financeira criada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar conta financeira.');
    } finally {
      setSaving(false);
    }
  }

  async function onCancelAccount(kind: 'payable' | 'receivable', id: string) {
    const reason = window.prompt('Motivo do cancelamento');
    if (reason === null) return;
    setSaving(true);
    setError(null);
    try {
      await cancelFinanceAccountRecord(kind, id, reason || undefined);
      setNotice('Registro cancelado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cancelar registro.');
    } finally {
      setSaving(false);
    }
  }

  async function onCancelLedger(id: string) {
    const reason = window.prompt('Motivo do cancelamento');
    if (reason === null) return;
    setSaving(true);
    setError(null);
    try {
      await cancelFinanceLedger(id, reason || undefined);
      setNotice('Lancamento cancelado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cancelar lancamento.');
    } finally {
      setSaving(false);
    }
  }

  const settleOptions = settleKind === 'PAYABLE' ? payables : receivables;
  const dailyCashFlow = report?.dailyCashFlow ?? [];
  const cmv = report?.cmv ?? null;
  const executiveAlerts = report?.executiveAlerts ?? [];
  const financeHealth = report?.financeHealth ?? null;
  const categoryBreakdowns = report?.breakdowns.categories ?? [];
  const costCenterBreakdowns = report?.breakdowns.costCenters ?? [];
  const dreComparison = report?.dreComparison ?? null;
  const dreCogsDetail = overview?.dre.cogsStatus === 'COMPLETE'
    ? 'calculado pelos custos gravados nos itens vendidos'
    : 'parcial: faltam custos, ficha tecnica ou snapshot em itens vendidos';

  function exportDreCsv() {
    const dre = overview?.dre;
    if (!dre) return;
    downloadCsv('menuhub-dre.csv', [
      ['Linha', 'Periodo atual', 'Periodo anterior', 'Variacao R$', 'Variacao %'],
      ['Receita bruta', dre.grossRevenue, dreComparison?.previous.grossRevenue ?? '', dreComparison?.deltas.grossRevenue.amount ?? '', dreComparison?.deltas.grossRevenue.percent ?? ''],
      ['Receita liquida', dre.netRevenue, dreComparison?.previous.netRevenue ?? '', dreComparison?.deltas.netRevenue.amount ?? '', dreComparison?.deltas.netRevenue.percent ?? ''],
      ['CMV', dre.cogs, dreComparison?.previous.cogs ?? '', dreComparison?.deltas.cogs.amount ?? '', dreComparison?.deltas.cogs.percent ?? ''],
      ['Margem bruta', dre.grossMargin, dreComparison?.previous.grossMargin ?? '', dreComparison?.deltas.grossMargin.amount ?? '', dreComparison?.deltas.grossMargin.percent ?? ''],
      ['Despesas operacionais', dre.operatingExpenses, dreComparison?.previous.operatingExpenses ?? '', dreComparison?.deltas.operatingExpenses.amount ?? '', dreComparison?.deltas.operatingExpenses.percent ?? ''],
      ['Lucro operacional', dre.operatingProfit, dreComparison?.previous.operatingProfit ?? '', dreComparison?.deltas.operatingProfit.amount ?? '', dreComparison?.deltas.operatingProfit.percent ?? ''],
    ]);
  }

  function exportCashFlowCsv() {
    downloadCsv('menuhub-fluxo-diario.csv', [
      ['Data', 'Entradas realizadas', 'Saidas realizadas', 'Saldo realizado', 'Saldo acumulado', 'Receber previsto', 'Pagar previsto', 'Saldo previsto'],
      ...dailyCashFlow.map((row) => [
        row.date,
        row.realizedInflow,
        row.realizedOutflow,
        row.realizedBalance,
        row.cumulativeBalance,
        row.forecastReceivables,
        row.forecastPayables,
        row.forecastBalance,
      ]),
    ]);
  }

  function exportAccountsCsv() {
    downloadCsv('menuhub-contas.csv', [
      ['Tipo', 'Descricao', 'Valor', 'Pago', 'Aberto', 'Status', 'Categoria', 'Centro', 'Vencimento'],
      ...payables.map((row) => accountCsvRow('Pagar', row)),
      ...receivables.map((row) => accountCsvRow('Receber', row)),
    ]);
  }

  function exportLedgerCsv() {
    downloadCsv('menuhub-lancamentos.csv', [
      ['Tipo', 'Valor', 'Categoria', 'Descricao', 'Origem', 'Data'],
      ...ledger.map((item) => [
        item.entryType,
        item.amount,
        item.category ?? '',
        item.description ?? '',
        item.originType,
        item.createdAt,
      ]),
    ]);
  }

  function exportCmvCsv() {
    downloadCsv('menuhub-cmv-produtos.csv', [
      ['Produto', 'Categoria', 'Qtd vendida', 'Receita', 'CMV', 'Margem', 'Margem %', 'Custo medio', 'Ficha tecnica', 'Status dados'],
      ...(cmv?.products ?? []).map((row) => [
        row.productName,
        row.categoryName ?? '',
        row.quantitySold,
        row.revenue,
        row.cogs,
        row.grossMargin,
        row.grossMarginPercent,
        row.averageUnitCost,
        row.hasRecipe ? 'Sim' : 'Nao',
        row.dataStatus,
      ]),
    ]);
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Carregando financeiro..." />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="Financeiro"
        subtitle="Fluxo de caixa, contas, DRE gerencial, CMV e conciliacao local"
        right={
          <div className={styles.headerActions}>
            <Button onClick={() => window.print()}>Imprimir/PDF</Button>
            <Button onClick={() => void load()}>Atualizar</Button>
          </div>
        }
      />

      <Card className={styles.card}>
        <h2>Periodo</h2>
        <form className={styles.toolbar} onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <Button type="submit">Aplicar periodo</Button>
        </form>
      </Card>

      {error ? (
        <Card className={styles.card}>
          <Badge tone="danger">Erro</Badge>
          <span>{error}</span>
        </Card>
      ) : null}
      {notice ? (
        <Card className={styles.card}>
          <Badge tone="success">OK</Badge>
          <span>{notice}</span>
        </Card>
      ) : null}

      <section className={styles.grid}>
        <Kpi title="Entradas realizadas" value={money(overview?.cashFlow.realized.inflow ?? 0)} />
        <Kpi title="Saidas realizadas" value={money(overview?.cashFlow.realized.outflow ?? 0)} />
        <Kpi title="Saldo realizado" value={money(overview?.cashFlow.realized.balance ?? 0)} />
        <Kpi title="Receber previsto" value={money(overview?.cashFlow.forecast.receivables ?? 0)} />
        <Kpi title="Pagar previsto" value={money(overview?.cashFlow.forecast.payables ?? 0)} />
        <Kpi title="Lucro operacional" value={money(overview?.dre.operatingProfit ?? 0)} />
      </section>

      <nav className={styles.tabs} aria-label="Secoes do financeiro">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.tabButton} ${activeTab === tab.key ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'summary' ? (
        <>
          <section className={styles.twoColumns}>
            <FinanceHealthCard health={financeHealth} />
            <ExecutiveAlerts alerts={executiveAlerts} />
          </section>
          <section className={styles.twoColumns}>
            <Card className={styles.card}>
              <h2>DRE do periodo</h2>
              <div className={styles.list}>
                <Metric label="Receita liquida" value={money(overview?.dre.netRevenue ?? 0)} />
                <Metric label="CMV" value={money(overview?.dre.cogs ?? 0)} detail={dreCogsDetail} />
                <Metric label="Margem bruta" value={`${money(overview?.dre.grossMargin ?? 0)} (${overview?.dre.grossMarginPercent ?? 0}%)`} />
                <Metric label="Lucro operacional" value={`${money(overview?.dre.operatingProfit ?? 0)} (${overview?.dre.operatingProfitPercent ?? 0}%)`} />
              </div>
            </Card>
            <Card className={styles.card}>
              <h2>Fluxo do periodo</h2>
              <div className={styles.list}>
                <Metric label="Saldo realizado" value={money(overview?.cashFlow.realized.balance ?? 0)} />
                <Metric label="Saldo previsto" value={money(overview?.cashFlow.forecast.balance ?? 0)} />
                <Metric label="Contas a pagar abertas" value={String(overview?.openPayables ?? 0)} />
                <Metric label="Contas a receber abertas" value={String(overview?.openReceivables ?? 0)} />
              </div>
            </Card>
          </section>
          <section className={styles.twoColumns}>
            <BreakdownList title="Categorias financeiras" rows={categoryBreakdowns} />
            <BreakdownList title="Centros de custo" rows={costCenterBreakdowns} />
          </section>
        </>
      ) : null}

      {activeTab === 'dre' ? (
        <section className={styles.twoColumns}>
          <Card className={styles.card}>
            <h2>DRE gerencial</h2>
            <div className={styles.list}>
              <Metric label="Receita bruta" value={money(overview?.dre.grossRevenue ?? 0)} />
              <Metric label="Cancelamentos/descontos" value={money(overview?.dre.canceledAmount ?? 0)} />
              <Metric label="Receita liquida" value={money(overview?.dre.netRevenue ?? 0)} />
              <Metric label="CMV" value={money(overview?.dre.cogs ?? 0)} detail={dreCogsDetail} />
              <Metric label="Margem bruta" value={`${money(overview?.dre.grossMargin ?? 0)} (${overview?.dre.grossMarginPercent ?? 0}%)`} />
              <Metric label="Despesas operacionais" value={money(overview?.dre.operatingExpenses ?? 0)} />
              <Metric label="Lucro operacional" value={`${money(overview?.dre.operatingProfit ?? 0)} (${overview?.dre.operatingProfitPercent ?? 0}%)`} />
            </div>
          </Card>
          <Card className={styles.card}>
            <h2>Comparativo anterior</h2>
            {dreComparison ? (
              <div className={styles.list}>
                <ComparisonMetric label="Receita liquida" amount={dreComparison.deltas.netRevenue.amount} percent={dreComparison.deltas.netRevenue.percent} />
                <ComparisonMetric label="CMV" amount={dreComparison.deltas.cogs.amount} percent={dreComparison.deltas.cogs.percent} />
                <ComparisonMetric label="Margem bruta" amount={dreComparison.deltas.grossMargin.amount} percent={dreComparison.deltas.grossMargin.percent} />
                <ComparisonMetric label="Despesas operacionais" amount={dreComparison.deltas.operatingExpenses.amount} percent={dreComparison.deltas.operatingExpenses.percent} />
                <ComparisonMetric label="Lucro operacional" amount={dreComparison.deltas.operatingProfit.amount} percent={dreComparison.deltas.operatingProfit.percent} />
              </div>
            ) : (
              <EmptyState title="Sem comparativo" />
            )}
          </Card>
        </section>
      ) : null}

      {activeTab === 'cashflow' ? (
        <>
          <section className={styles.twoColumns}>
            <Card className={styles.card}>
              <h2>Fluxo realizado</h2>
              <div className={styles.list}>
                <Metric label="Entradas realizadas" value={money(overview?.cashFlow.realized.inflow ?? 0)} />
                <Metric label="Saidas realizadas" value={money(overview?.cashFlow.realized.outflow ?? 0)} />
                <Metric label="Saldo realizado" value={money(overview?.cashFlow.realized.balance ?? 0)} />
              </div>
            </Card>
            <Card className={styles.card}>
              <h2>Fluxo projetado</h2>
              <div className={styles.list}>
                <Metric label="Contas a receber previstas" value={money(overview?.cashFlow.forecast.receivables ?? 0)} />
                <Metric label="Contas a pagar previstas" value={money(overview?.cashFlow.forecast.payables ?? 0)} />
                <Metric label="Saldo previsto" value={money(overview?.cashFlow.forecast.balance ?? 0)} />
              </div>
            </Card>
          </section>
          <DailyCashFlowTable rows={dailyCashFlow} />
        </>
      ) : null}

      {activeTab === 'cmv' ? (
        <CmvDashboard cmv={cmv} />
      ) : null}

      {activeTab === 'accounts' ? (
        <>
          <section className={styles.twoColumns}>
            <Card className={styles.card}>
              <h2>Lancamento manual</h2>
              <form className={styles.formRow} onSubmit={(event) => void onCreateEntry(event)}>
                <Select value={entryType} onChange={(event) => setEntryType(event.target.value as 'REVENUE' | 'EXPENSE')}>
                  <option value="REVENUE">Receita</option>
                  <option value="EXPENSE">Despesa</option>
                </Select>
                <Input placeholder="Valor" value={amount} onChange={(event) => setAmount(event.target.value)} />
                <Input placeholder="Descricao" value={description} onChange={(event) => setDescription(event.target.value)} />
                <OptionInput id="ledger-category" placeholder="Categoria" value={category} onChange={setCategory} options={categories} />
                <OptionInput id="ledger-cost-center" placeholder="Centro de custo" value={costCenter} onChange={setCostCenter} options={costCenters} />
                <Select value={entryFinancialAccountId} onChange={(event) => setEntryFinancialAccountId(event.target.value)}>
                  <option value="">Conta financeira</option>
                  {financialAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name} - {account.type}</option>
                  ))}
                </Select>
                <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Criar lancamento'}</Button>
              </form>
            </Card>

            <Card className={styles.card}>
              <h2>Contas manuais</h2>
              <form className={styles.formRow} onSubmit={(event) => void onCreateAccount(event)}>
                <Select value={accountKind} onChange={(event) => setAccountKind(event.target.value as AccountKind)}>
                  <option value="PAYABLE">Conta a pagar</option>
                  <option value="RECEIVABLE">Conta a receber</option>
                </Select>
                <Input placeholder="Valor" value={accountAmount} onChange={(event) => setAccountAmount(event.target.value)} />
                <Input placeholder="Descricao" value={accountDescription} onChange={(event) => setAccountDescription(event.target.value)} />
                <Input type="date" value={accountDueDate} onChange={(event) => setAccountDueDate(event.target.value)} />
                <OptionInput id="account-category" placeholder="Categoria" value={accountCategory} onChange={setAccountCategory} options={categories} />
                <OptionInput id="account-cost-center" placeholder="Centro de custo" value={accountCostCenter} onChange={setAccountCostCenter} options={costCenters} />
                <Select value={accountFinancialAccountId} onChange={(event) => setAccountFinancialAccountId(event.target.value)}>
                  <option value="">Conta financeira</option>
                  {financialAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name} - {account.type}</option>
                  ))}
                </Select>
                <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Criar conta'}</Button>
              </form>
            </Card>
          </section>

          <Card className={styles.card}>
            <h2>Baixa / recebimento</h2>
            <form className={styles.formRow} onSubmit={(event) => void onSettleAccount(event)}>
              <Select value={settleKind} onChange={(event) => { setSettleKind(event.target.value as AccountKind); setSettleAccountId(''); }}>
                <option value="PAYABLE">Pagar conta</option>
                <option value="RECEIVABLE">Receber conta</option>
              </Select>
              <Select value={settleAccountId} onChange={(event) => setSettleAccountId(event.target.value)}>
                <option value="">Selecione a conta</option>
                {settleOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.description} - {money(Math.max(0, row.amount - row.paidAmount))}
                  </option>
                ))}
              </Select>
              <Input placeholder="Valor" value={settleAmount} onChange={(event) => setSettleAmount(event.target.value)} />
              <Select value={settleMethod} onChange={(event) => setSettleMethod(event.target.value)}>
                <option value="EXTERNAL">Manual</option>
                <option value="CASH">Dinheiro</option>
                <option value="PIX">PIX</option>
                <option value="CARD">Cartao</option>
                <option value="BANK_TRANSFER">Transferencia</option>
              </Select>
              <Button type="submit" disabled={settling}>{settling ? 'Registrando...' : 'Registrar baixa'}</Button>
            </form>
          </Card>

          <section className={styles.twoColumns}>
            <AccountList title="Contas a pagar" rows={payables} kind="payable" onCancel={onCancelAccount} />
            <AccountList title="Contas a receber" rows={receivables} kind="receivable" onCancel={onCancelAccount} />
          </section>
        </>
      ) : null}

      {activeTab === 'reconciliation' ? (
        <section className={styles.twoColumns}>
          <Card className={styles.card}>
            <h2>Conciliacao</h2>
            <div className={styles.list}>
              <Metric label="Itens analisados" value={String(reconciliation?.summary.totalItems ?? 0)} />
              <Metric label="Divergentes" value={String(reconciliation?.summary.divergent ?? 0)} />
              <Metric label="Pendentes" value={String(reconciliation?.summary.pending ?? 0)} />
              {(reconciliation?.items ?? []).slice(0, 10).map((item) => (
                <div key={`${item.type}-${item.referenceId}`} className={styles.row}>
                  <strong>{item.type}</strong>
                  <div className={styles.meta}>
                    <span>Referencia: {item.referenceId}</span>
                    <span>Diferenca: {money(item.differenceAmount)}</span>
                    <span>Status: {item.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card className={styles.card}>
            <h2>Ultimos lancamentos</h2>
            <div className={styles.list}>
              {ledger.length === 0 ? <EmptyState title="Sem lancamentos" /> : null}
              {ledger.slice(0, 12).map((item) => (
                <div key={item.id} className={styles.row}>
                  <strong>{item.entryType === 'REVENUE' ? 'Receita' : item.entryType === 'EXPENSE' ? 'Despesa' : item.entryType}</strong>
                  <div className={styles.meta}>
                    <span>Valor: {money(item.amount)}</span>
                    <span>Categoria: {item.category ?? '-'}</span>
                    <span>Centro: {item.costCenter ?? '-'}</span>
                    <span>Conta: {item.financialAccount?.name ?? '-'}</span>
                    <span>Descricao: {item.description ?? '-'}</span>
                    <span>Origem: {item.originType}</span>
                  </div>
                  {item.status !== 'CANCELED' ? (
                    <div>
                      <Button type="button" onClick={() => void onCancelLedger(item.id)}>Cancelar lancamento</Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        </section>
      ) : null}

      {activeTab === 'settings' ? (
        <>
          <section className={styles.threeColumns}>
            <Card className={styles.card}>
              <h2>Categorias financeiras</h2>
              <form className={styles.compactForm} onSubmit={(event) => void onCreateCategory(event)}>
                <Input placeholder="Nome da categoria" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} />
                <Select value={newCategoryType} onChange={(event) => setNewCategoryType(event.target.value as 'REVENUE' | 'EXPENSE' | 'BOTH')}>
                  <option value="EXPENSE">Despesa</option>
                  <option value="REVENUE">Receita</option>
                  <option value="BOTH">Ambos</option>
                </Select>
                <Button type="submit" disabled={saving}>Criar</Button>
              </form>
              <SetupList rows={categories} emptyTitle="Sem categorias" detail={(row) => row.type ?? '-'} />
            </Card>
            <Card className={styles.card}>
              <h2>Centros de custo</h2>
              <form className={styles.compactForm} onSubmit={(event) => void onCreateCostCenter(event)}>
                <Input placeholder="Nome do centro" value={newCostCenterName} onChange={(event) => setNewCostCenterName(event.target.value)} />
                <Button type="submit" disabled={saving}>Criar</Button>
              </form>
              <SetupList rows={costCenters} emptyTitle="Sem centros" detail={(row) => row.status ?? '-'} />
            </Card>
            <Card className={styles.card}>
              <h2>Contas financeiras</h2>
              <form className={styles.compactForm} onSubmit={(event) => void onCreateFinancialAccount(event)}>
                <Input placeholder="Nome da conta" value={newFinancialAccountName} onChange={(event) => setNewFinancialAccountName(event.target.value)} />
                <Select value={newFinancialAccountType} onChange={(event) => setNewFinancialAccountType(event.target.value)}>
                  <option value="BANK">Banco</option>
                  <option value="CASH">Caixa</option>
                  <option value="PIX">PIX</option>
                  <option value="CARD">Cartao</option>
                  <option value="MARKETPLACE">Marketplace</option>
                  <option value="TRANSITORY">Transitoria</option>
                  <option value="OTHER">Outra</option>
                </Select>
                <Button type="submit" disabled={saving}>Criar</Button>
              </form>
              <div className={styles.list}>
                {financialAccounts.length === 0 ? <EmptyState title="Sem contas financeiras" /> : null}
                {financialAccounts.map((account) => (
                  <div key={account.id} className={styles.row}>
                    <strong>{account.name}</strong>
                    <div className={styles.meta}>
                      <span>{account.type}</span>
                      <span>Saldo: {money(account.currentBalance)}</span>
                      <span>{account.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>
          <section className={styles.twoColumns}>
            <PaymentFeeList rows={paymentFees} />
            <ReceivableScheduleList rows={receivableSchedules} />
          </section>
        </>
      ) : null}

      {activeTab === 'exports' ? (
        <Card className={styles.card}>
          <h2>Exportacoes CSV</h2>
          <div className={styles.exportGrid}>
            <Button onClick={exportDreCsv}>Exportar DRE</Button>
            <Button onClick={exportCashFlowCsv}>Exportar fluxo diario</Button>
            <Button onClick={exportCmvCsv}>Exportar CMV</Button>
            <Button onClick={exportAccountsCsv}>Exportar contas</Button>
            <Button onClick={exportLedgerCsv}>Exportar lancamentos</Button>
          </div>
        </Card>
      ) : null}
    </main>
  );
}

function FinanceHealthCard({ health }: { health: FinanceHealth | null }) {
  if (!health) {
    return (
      <Card className={styles.card}>
        <h2>Saude financeira</h2>
        <EmptyState title="Sem score calculado" />
      </Card>
    );
  }
  return (
    <Card className={styles.card}>
      <h2>Saude financeira</h2>
      <div className={styles.scoreRow}>
        <strong className={styles.scoreValue}>{health.score}</strong>
        <span>{health.status}</span>
      </div>
      <div className={styles.scoreBar} aria-hidden="true">
        <span className={styles.scoreFill} style={{ width: `${Math.max(0, Math.min(100, health.score))}%` }} />
      </div>
      <div className={styles.meta}>
        {health.penalties.length === 0 ? <span>Sem penalidades no periodo</span> : null}
        {health.penalties.map((item) => <span key={item}>{item}</span>)}
      </div>
    </Card>
  );
}

function ExecutiveAlerts({ alerts }: { alerts: ExecutiveAlert[] }) {
  return (
    <Card className={styles.card}>
      <h2>Pontos de atencao</h2>
      <div className={styles.alertGrid}>
        {alerts.length === 0 ? <EmptyState title="Sem alertas" /> : null}
        {alerts.map((alert) => (
          <div key={`${alert.title}-${alert.metric}`} className={`${styles.alert} ${styles[`${alert.severity}Alert`]}`}>
            <strong>{alert.title}</strong>
            <span>{alert.detail}</span>
            <small>{alert.metric}</small>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CmvDashboard({ cmv }: { cmv: CmvReport | null }) {
  if (!cmv) {
    return (
      <Card className={styles.card}>
        <h2>CMV / Margem</h2>
        <EmptyState title="Sem dados de CMV" />
      </Card>
    );
  }
  return (
    <>
      <section className={styles.grid}>
        <Kpi title="Receita dos produtos" value={money(cmv.summary.totalRevenue)} />
        <Kpi title="CMV calculado" value={money(cmv.summary.totalCogs)} />
        <Kpi title="Margem bruta" value={money(cmv.summary.grossMargin)} />
        <Kpi title="Margem %" value={`${cmv.summary.grossMarginPercent.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} />
        <Kpi title="Produtos vendidos" value={String(cmv.summary.soldProducts)} />
        <Kpi title="Status dos dados" value={cmv.summary.dataStatus} />
      </section>
      <section className={styles.twoColumns}>
        <Card className={styles.card}>
          <h2>Qualidade do CMV</h2>
          <div className={styles.list}>
            <Metric label="Itens vendidos" value={String(cmv.summary.soldItems)} />
            <Metric label="Itens sem custo" value={String(cmv.summary.itemsWithoutCost)} />
            <Metric label="Produtos sem ficha tecnica" value={String(cmv.summary.productsWithoutRecipe)} />
            <Metric label="Custos por fallback" value={String(cmv.summary.fallbackCostItems)} detail="usa custo teorico ou cadastro do produto quando nao ha snapshot fechado" />
          </div>
        </Card>
        <Card className={styles.card}>
          <h2>Produtos com maior CMV</h2>
          <div className={styles.list}>
            {cmv.products.length === 0 ? <EmptyState title="Sem produtos vendidos no periodo" /> : null}
            {cmv.products.slice(0, 8).map((row) => (
              <div key={`${row.productId ?? row.productName}`} className={styles.row}>
                <strong>{row.productName}</strong>
                <div className={styles.meta}>
                  <span>Categoria: {row.categoryName ?? '-'}</span>
                  <span>CMV: {money(row.cogs)}</span>
                  <span>Margem: {money(row.grossMargin)}</span>
                  <span>Status: {row.dataStatus}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>
      <Card className={styles.card}>
        <h2>CMV por produto</h2>
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Qtd</th>
                <th>Receita</th>
                <th>CMV</th>
                <th>Margem</th>
                <th>Ficha</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cmv.products.map((row) => (
                <tr key={`${row.productId ?? row.productName}-table`}>
                  <td>{row.productName}</td>
                  <td>{row.categoryName ?? '-'}</td>
                  <td>{row.quantitySold.toLocaleString('pt-BR')}</td>
                  <td>{money(row.revenue)}</td>
                  <td>{money(row.cogs)}</td>
                  <td>{money(row.grossMargin)} ({row.grossMarginPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)</td>
                  <td>{row.hasRecipe ? 'Sim' : 'Nao'}</td>
                  <td>{row.dataStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function OptionInput({
  id,
  placeholder,
  value,
  onChange,
  options,
}: {
  id: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: FinanceOption[];
}) {
  return (
    <>
      <Input placeholder={placeholder} value={value} list={id} onChange={(event) => onChange(event.target.value)} />
      <datalist id={id}>
        {options.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
      </datalist>
    </>
  );
}

function Kpi({ title, value }: { title: string; value: string }) {
  return (
    <Card className={styles.card}>
      <span className={styles.muted}>{title}</span>
      <strong className={styles.kpiValue}>{value}</strong>
    </Card>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className={styles.row}>
      <strong>{label}</strong>
      <div className={styles.meta}>
        <span>{value}</span>
        {detail ? <span>{detail}</span> : null}
      </div>
    </div>
  );
}

function AccountList({
  title,
  rows,
  kind,
  onCancel,
}: {
  title: string;
  rows: FinanceAccount[];
  kind: 'payable' | 'receivable';
  onCancel: (kind: 'payable' | 'receivable', id: string) => void;
}) {
  return (
    <Card className={styles.card}>
      <h2>{title}</h2>
      <div className={styles.list}>
        {rows.length === 0 ? <EmptyState title="Sem registros" /> : null}
        {rows.map((row) => (
          <div key={row.id} className={styles.row}>
            <strong>{row.description}</strong>
            <div className={styles.meta}>
              <span>Valor: {money(row.amount)}</span>
              <span>Pago: {money(row.paidAmount)}</span>
              <span>Aberto: {money(Math.max(0, row.amount - row.paidAmount))}</span>
              <span>Status: {row.status}</span>
              <span>Categoria: {row.category ?? '-'}</span>
              <span>Centro: {row.costCenter ?? '-'}</span>
              <span>Conta: {row.financialAccount?.name ?? '-'}</span>
              <span>Vencimento: {row.dueDate ? new Date(row.dueDate).toLocaleDateString('pt-BR') : '-'}</span>
            </div>
            {row.status !== 'PAID' && row.status !== 'CANCELED' ? (
              <div>
                <Button type="button" onClick={() => onCancel(kind, row.id)}>Cancelar</Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function SetupList({
  rows,
  emptyTitle,
  detail,
}: {
  rows: FinanceOption[];
  emptyTitle: string;
  detail: (row: FinanceOption) => string;
}) {
  return (
    <div className={styles.list}>
      {rows.length === 0 ? <EmptyState title={emptyTitle} /> : null}
      {rows.map((row) => (
        <div key={row.key} className={styles.row}>
          <strong>{row.label}</strong>
          <div className={styles.meta}>
            <span>{detail(row)}</span>
            <span>{row.status ?? 'ACTIVE'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PaymentFeeList({ rows }: { rows: PaymentFee[] }) {
  return (
    <Card className={styles.card}>
      <h2>Taxas de pagamento</h2>
      <div className={styles.list}>
        {rows.length === 0 ? <EmptyState title="Sem taxas no periodo" /> : null}
        {rows.slice(0, 20).map((row) => (
          <div key={row.id} className={styles.row}>
            <strong>{row.method ?? row.provider ?? 'Pagamento'}</strong>
            <div className={styles.meta}>
              <span>Bruto: {money(row.grossAmount)}</span>
              <span>Taxa: {money(row.feeAmount)}</span>
              <span>Liquido: {money(row.netAmount)}</span>
              <span>{new Date(row.occurredAt).toLocaleDateString('pt-BR')}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReceivableScheduleList({ rows }: { rows: ReceivableSchedule[] }) {
  return (
    <Card className={styles.card}>
      <h2>Agenda de recebiveis</h2>
      <div className={styles.list}>
        {rows.length === 0 ? <EmptyState title="Sem recebiveis previstos" /> : null}
        {rows.slice(0, 20).map((row) => (
          <div key={row.id} className={styles.row}>
            <strong>{row.method ?? row.provider ?? 'Recebivel'}</strong>
            <div className={styles.meta}>
              <span>Bruto: {money(row.grossAmount)}</span>
              <span>Taxa: {money(row.feeAmount)}</span>
              <span>Liquido: {money(row.netAmount)}</span>
              <span>Previsto: {new Date(row.expectedDate).toLocaleDateString('pt-BR')}</span>
              <span>Status: {row.status}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ComparisonMetric({ label, amount, percent }: { label: string; amount: number; percent: number | null }) {
  const tone = amount >= 0 ? styles.positive : styles.negative;
  return (
    <div className={styles.row}>
      <strong>{label}</strong>
      <div className={styles.meta}>
        <span className={tone}>{money(amount)}</span>
        <span>{percent === null ? 'Sem base anterior' : `${percent.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}</span>
      </div>
    </div>
  );
}

function BreakdownList({ title, rows }: { title: string; rows: FinanceBreakdownItem[] }) {
  return (
    <Card className={styles.card}>
      <h2>{title}</h2>
      <div className={styles.list}>
        {rows.length === 0 ? <EmptyState title="Sem agrupamentos" /> : null}
        {rows.slice(0, 10).map((row) => (
          <div key={row.key} className={styles.row}>
            <strong>{row.label}</strong>
            <div className={styles.meta}>
              <span>Receita: {money(row.revenue)}</span>
              <span>Despesa: {money(row.expense)}</span>
              <span>Pendente: {money(row.pendingReceivable + row.pendingPayable)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DailyCashFlowTable({ rows }: { rows: DailyCashFlowRow[] }) {
  return (
    <Card className={styles.card}>
      <h2>Fluxo diario</h2>
      {rows.length === 0 ? <EmptyState title="Sem dados diarios" /> : null}
      {rows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Entradas</th>
                <th>Saidas</th>
                <th>Saldo</th>
                <th>Acumulado</th>
                <th>Receber</th>
                <th>Pagar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date}>
                  <td>{new Date(`${row.date}T00:00:00`).toLocaleDateString('pt-BR')}</td>
                  <td>{money(row.realizedInflow)}</td>
                  <td>{money(row.realizedOutflow)}</td>
                  <td className={row.realizedBalance >= 0 ? styles.positive : styles.negative}>{money(row.realizedBalance)}</td>
                  <td>{money(row.cumulativeBalance)}</td>
                  <td>{money(row.forecastReceivables)}</td>
                  <td>{money(row.forecastPayables)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}

function accountCsvRow(kind: string, row: FinanceAccount) {
  return [
    kind,
    row.description,
    row.amount,
    row.paidAmount,
    Math.max(0, row.amount - row.paidAmount),
    row.status,
    row.category ?? '',
    row.costCenter ?? '',
    row.dueDate ?? '',
  ];
}

function downloadCsv(filename: string, rows: Array<Array<string | number | null>>) {
  const csv = rows.map((row) => row.map(csvValue).join(';')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvValue(value: string | number | null) {
  const raw = value === null ? '' : String(value).replace(/\r?\n/g, ' ');
  return `"${raw.replace(/"/g, '""')}"`;
}

function parsePositiveAmount(value: string): number | null {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function money(value: number): string {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
