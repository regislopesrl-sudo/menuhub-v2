'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  createManualFinanceEntry,
  getFinanceOverview,
  getFinanceReconciliation,
  listFinanceLedger,
  listFinancePayables,
  listFinanceReceivables,
  type FinanceAccount,
  type FinanceLedgerEntry,
  type FinanceOverview,
  type FinanceReconciliation,
} from '@/features/finance/finance.api';
import styles from './page.module.css';

export default function AdminFinancePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [ledger, setLedger] = useState<FinanceLedgerEntry[]>([]);
  const [payables, setPayables] = useState<FinanceAccount[]>([]);
  const [receivables, setReceivables] = useState<FinanceAccount[]>([]);
  const [reconciliation, setReconciliation] = useState<FinanceReconciliation | null>(null);

  const [entryType, setEntryType] = useState<'REVENUE' | 'EXPENSE'>('REVENUE');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [costCenter, setCostCenter] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [ov, led, payableRows, receivableRows, rec] = await Promise.all([
        getFinanceOverview(),
        listFinanceLedger(),
        listFinancePayables(),
        listFinanceReceivables(),
        getFinanceReconciliation(),
      ]);
      setOverview(ov);
      setLedger(led);
      setPayables(payableRows);
      setReceivables(receivableRows);
      setReconciliation(rec);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar financeiro.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreateEntry(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
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

      <Card className={styles.card}>
        <h2>Lancamento manual</h2>
        <form className={styles.formRow} onSubmit={(event) => void onCreateEntry(event)}>
          <select value={entryType} onChange={(event) => setEntryType(event.target.value as 'REVENUE' | 'EXPENSE')}>
            <option value="REVENUE">Receita</option>
            <option value="EXPENSE">Despesa</option>
          </select>
          <Input placeholder="Valor" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <Input placeholder="Descricao" value={description} onChange={(event) => setDescription(event.target.value)} />
          <Input placeholder="Categoria" value={category} onChange={(event) => setCategory(event.target.value)} />
          <Input placeholder="Centro de custo" value={costCenter} onChange={(event) => setCostCenter(event.target.value)} />
          <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Criar lancamento'}</Button>
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
              <span>Status: {row.status}</span>
              <span>Vencimento: {row.dueDate ? new Date(row.dueDate).toLocaleDateString('pt-BR') : '-'}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function money(value: number): string {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
