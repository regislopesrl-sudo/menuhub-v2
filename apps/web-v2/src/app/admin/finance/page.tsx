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
  getFinanceReport,
  settlePayable,
  settleReceivable,
  type FinanceAccount,
  type FinanceLedgerEntry,
  type FinanceOption,
  type FinanceOverview,
  type FinanceReconciliation,
} from '@/features/finance/finance.api';
import styles from './page.module.css';

type AccountKind = 'PAYABLE' | 'RECEIVABLE';

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

export default function AdminFinancePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [ledger, setLedger] = useState<FinanceLedgerEntry[]>([]);
  const [payables, setPayables] = useState<FinanceAccount[]>([]);
  const [receivables, setReceivables] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceOption[]>([]);
  const [costCenters, setCostCenters] = useState<FinanceOption[]>([]);
  const [reconciliation, setReconciliation] = useState<FinanceReconciliation | null>(null);

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const [entryType, setEntryType] = useState<'REVENUE' | 'EXPENSE'>('REVENUE');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [costCenter, setCostCenter] = useState('');

  const [accountKind, setAccountKind] = useState<AccountKind>('PAYABLE');
  const [accountAmount, setAccountAmount] = useState('');
  const [accountDescription, setAccountDescription] = useState('');
  const [accountDueDate, setAccountDueDate] = useState(today);
  const [accountCategory, setAccountCategory] = useState('');
  const [accountCostCenter, setAccountCostCenter] = useState('');

  const [settleKind, setSettleKind] = useState<AccountKind>('PAYABLE');
  const [settleAccountId, setSettleAccountId] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState('manual');

  async function load() {
    setLoading(true);
    setError(null);
    const params = { from, to };
    try {
      const report = await getFinanceReport(params);
      setOverview(report.overview);
      setLedger(report.ledger);
      setPayables(report.payables);
      setReceivables(report.receivables);
      setReconciliation(report.reconciliation);
      setCategories(report.categories);
      setCostCenters(report.costCenters);
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
      });
      setAmount('');
      setDescription('');
      setCategory('');
      setCostCenter('');
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

  const settleOptions = settleKind === 'PAYABLE' ? payables : receivables;

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
        subtitle="Fluxo de caixa, contas, DRE simplificada e conciliacao local"
        right={<Button onClick={() => void load()}>Atualizar</Button>}
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
        <Kpi title="Lucro operacional" value={money(overview?.dre.operatingProfit ?? 0)} />
      </section>

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
            <option value="manual">Manual</option>
            <option value="cash">Dinheiro</option>
            <option value="pix_mock">PIX mock</option>
            <option value="card_mock">Cartao mock</option>
          </Select>
          <Button type="submit" disabled={settling}>{settling ? 'Registrando...' : 'Registrar baixa'}</Button>
        </form>
      </Card>

      <section className={styles.twoColumns}>
        <Card className={styles.card}>
          <h2>DRE simplificada</h2>
          <div className={styles.list}>
            <Metric label="Receita bruta" value={money(overview?.dre.grossRevenue ?? 0)} />
            <Metric label="Receita liquida" value={money(overview?.dre.netRevenue ?? 0)} />
            <Metric label="CMV" value={money(overview?.dre.cogs ?? 0)} detail="pendente de ficha tecnica/estoque fechado" />
            <Metric label="Margem bruta" value={`${money(overview?.dre.grossMargin ?? 0)} (${overview?.dre.grossMarginPercent ?? 0}%)`} />
            <Metric label="Despesas operacionais" value={money(overview?.dre.operatingExpenses ?? 0)} />
          </div>
        </Card>

        <Card className={styles.card}>
          <h2>Conciliacao</h2>
          <div className={styles.list}>
            <Metric label="Itens analisados" value={String(reconciliation?.summary.totalItems ?? 0)} />
            <Metric label="Divergentes" value={String(reconciliation?.summary.divergent ?? 0)} />
            <Metric label="Pendentes" value={String(reconciliation?.summary.pending ?? 0)} />
            {(reconciliation?.items ?? []).slice(0, 6).map((item) => (
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
      </section>

      <section className={styles.twoColumns}>
        <AccountList title="Contas a pagar" rows={payables} />
        <AccountList title="Contas a receber" rows={receivables} />
      </section>

      <Card className={styles.card}>
        <h2>Ultimos lancamentos</h2>
        <div className={styles.list}>
          {ledger.length === 0 ? <EmptyState title="Sem lancamentos" /> : null}
          {ledger.map((item) => (
            <div key={item.id} className={styles.row}>
              <strong>{item.entryType === 'REVENUE' ? 'Receita' : item.entryType === 'EXPENSE' ? 'Despesa' : item.entryType}</strong>
              <div className={styles.meta}>
                <span>Valor: {money(item.amount)}</span>
                <span>Categoria: {item.category ?? '-'}</span>
                <span>Descricao: {item.description ?? '-'}</span>
                <span>Origem: {item.originType}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </main>
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

function AccountList({ title, rows }: { title: string; rows: FinanceAccount[] }) {
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
              <span>Vencimento: {row.dueDate ? new Date(row.dueDate).toLocaleDateString('pt-BR') : '-'}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function parsePositiveAmount(value: string): number | null {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function money(value: number): string {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}


