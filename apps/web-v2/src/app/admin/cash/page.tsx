'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ModuleDisabled } from '@/components/module-disabled';
import { useModuleAccess } from '@/features/modules/use-module-access';
import {
  closePdvSession,
  createPdvMovement,
  getCurrentOpenPdvSession,
  getPdvOperatorSummary,
  getPdvSessionDivergence,
  getPdvSessionSummary,
  listPdvSessionLedger,
  listPdvSessions,
  openPdvSession,
  type PdvCashLedgerEntry,
  type PdvMovementType,
  type PdvOpenSession,
  type PdvOperatorSummary,
  type PdvSessionDivergence,
  type PdvSessionListItem,
  type PdvSessionSummary,
} from '@/features/pdv/pdv.api';

type CashTab = 'operations' | 'conference' | 'previous';
type CashDialog = null | 'SUPPLY' | 'WITHDRAWAL' | 'ADJUSTMENT';

const typeOptions: Array<{ value: 'ALL' | PdvMovementType; label: string }> = [
  { value: 'ALL', label: 'Todos os tipos' },
  { value: 'SALE', label: 'Venda' },
  { value: 'SUPPLY', label: 'Suprimento' },
  { value: 'WITHDRAWAL', label: 'Sangria' },
  { value: 'ADJUSTMENT', label: 'Ajuste' },
];

const paymentOptions = ['Todas formas', 'Dinheiro', 'Pix', 'Cartao de credito', 'Cartao de debito', 'Cartao online', 'iFood'];

function currency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function parseMoneyInput(value: string) {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized || '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateTime(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function movementLabel(type: PdvMovementType) {
  if (type === 'SUPPLY') return 'Suprimento';
  if (type === 'WITHDRAWAL') return 'Sangria';
  if (type === 'SALE') return 'Venda';
  return 'Ajuste';
}

function paymentDisplayLabel(method?: string) {
  const normalized = (method ?? '').toUpperCase();
  if (!normalized) return 'Outros';
  if (normalized.includes('DINHEIRO') || normalized.includes('CASH')) return 'Dinheiro';
  if (normalized.includes('PIX') && (normalized.includes('AUTO') || normalized.includes('ONLINE'))) return 'Pix automatico';
  if (normalized.includes('PIX')) return 'Pix';
  if (normalized.includes('DEBIT') || normalized.includes('DEBITO') || normalized.includes('DÉBITO')) return 'Cartao de debito';
  if (normalized.includes('CREDIT') || normalized.includes('CREDITO') || normalized.includes('CRÉDITO')) return 'Cartao de credito';
  if (normalized.includes('ONLINE')) return 'Cartao online';
  if (normalized.includes('IFOOD')) return 'iFood';
  if (normalized.includes('CARD') || normalized.includes('CARTAO') || normalized.includes('CARTÃO')) return 'Cartao';
  return method ?? 'Outros';
}

function dialogTitle(dialog: CashDialog) {
  if (dialog === 'SUPPLY') return 'Suprimento';
  if (dialog === 'WITHDRAWAL') return 'Sangria';
  if (dialog === 'ADJUSTMENT') return 'Ajuste de caixa';
  return '';
}

function differenceTone(value?: number | null) {
  if (!value) return styles.neutralValue;
  return value > 0 ? styles.successValue : styles.dangerValue;
}

export default function AdminCashPage() {
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const access = useModuleAccess({ companyId, branchId, userRole: 'admin' }, 'pdv');

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSession, setOpenSession] = useState<PdvOpenSession | null>(null);
  const [summary, setSummary] = useState<PdvSessionSummary | null>(null);
  const [operatorSummary, setOperatorSummary] = useState<PdvOperatorSummary | null>(null);
  const [divergence, setDivergence] = useState<PdvSessionDivergence | null>(null);
  const [ledger, setLedger] = useState<PdvCashLedgerEntry[]>([]);
  const [sessions, setSessions] = useState<PdvSessionListItem[]>([]);
  const [activeTab, setActiveTab] = useState<CashTab>('operations');
  const [dialog, setDialog] = useState<CashDialog>(null);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState(paymentOptions[0]);
  const [typeFilter, setTypeFilter] = useState<'ALL' | PdvMovementType>('ALL');
  const [openingBalanceInput, setOpeningBalanceInput] = useState('0');
  const [declaredCashInput, setDeclaredCashInput] = useState('');
  const [closureNotesInput, setClosureNotesInput] = useState('');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');

  const headers = useMemo(() => ({ companyId, branchId }), [branchId, companyId]);

  const loadSessionDetails = useCallback(
    async (session: PdvOpenSession) => {
      const [nextSummary, nextLedger, operator, nextDivergence] = await Promise.all([
        getPdvSessionSummary({ ...headers, sessionId: session.id }),
        listPdvSessionLedger({ ...headers, sessionId: session.id }),
        getPdvOperatorSummary({ ...headers, sessionId: session.id }),
        getPdvSessionDivergence({ ...headers, sessionId: session.id }),
      ]);
      setSummary(nextSummary);
      setLedger(nextLedger);
      setOperatorSummary(operator);
      setDivergence(nextDivergence);
      setDeclaredCashInput((current) => current.trim() || String(nextSummary.expectedCashAmount));
    },
    [headers],
  );

  const loadCash = useCallback(async () => {
    if (access.loading || !access.allowed) return;
    setLoading(true);
    setError(null);
    try {
      const [current, nextSessions] = await Promise.all([getCurrentOpenPdvSession(headers), listPdvSessions(headers)]);
      setOpenSession(current);
      setSessions(nextSessions);
      if (current) {
        await loadSessionDetails(current);
      } else {
        setSummary(null);
        setLedger([]);
        setOperatorSummary(null);
        setDivergence(null);
        setDeclaredCashInput('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar caixa.');
    } finally {
      setLoading(false);
    }
  }, [access.allowed, access.loading, headers, loadSessionDetails]);

  useEffect(() => {
    void loadCash();
  }, [loadCash]);

  useEffect(() => {
    if (access.loading || !access.allowed || !openSession?.id) return;
    const intervalId = window.setInterval(() => {
      void loadSessionDetails(openSession).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [access.allowed, access.loading, loadSessionDetails, openSession]);

  const filteredLedger = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ledger.filter((entry) => {
      const matchesSearch = !term
        || entry.description.toLowerCase().includes(term)
        || entry.paymentMethod.toLowerCase().includes(term)
        || entry.userLabel.toLowerCase().includes(term)
        || entry.orderNumber?.toLowerCase().includes(term);
      const matchesType = typeFilter === 'ALL' || entry.type === typeFilter;
      const matchesPayment = paymentFilter === paymentOptions[0] || entry.paymentMethod === paymentFilter;
      return matchesSearch && matchesType && matchesPayment;
    });
  }, [ledger, paymentFilter, search, typeFilter]);

  const paymentBreakdown = useMemo(() => {
    const groups = new Map<string, { label: string; amount: number; count: number }>();
    const ensure = (label: string) => {
      if (!groups.has(label)) groups.set(label, { label, amount: 0, count: 0 });
      return groups.get(label)!;
    };

    ledger
      .filter((entry) => entry.type === 'SALE')
      .forEach((entry) => {
        const label = paymentDisplayLabel(entry.paymentMethod);
        const group = ensure(label);
        group.amount += entry.amount;
        group.count += 1;
      });

    if (groups.size === 0 && summary) {
      ensure('Dinheiro').amount = summary.totalsByMethod.cash ?? 0;
      ensure('Pix').amount = summary.totalsByMethod.pix ?? 0;
      ensure('Cartao').amount = summary.totalsByMethod.card ?? 0;
    }

    const preferredOrder = ['Dinheiro', 'Pix', 'Pix automatico', 'Cartao de debito', 'Cartao de credito', 'Cartao online', 'Cartao', 'iFood', 'Outros'];
    return Array.from(groups.values()).sort((a, b) => {
      const orderA = preferredOrder.indexOf(a.label);
      const orderB = preferredOrder.indexOf(b.label);
      return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB) || a.label.localeCompare(b.label);
    });
  }, [ledger, summary]);

  if (access.loading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Validando acesso ao caixa..." />
      </main>
    );
  }

  if (!access.allowed) {
    return <ModuleDisabled moduleName="Caixa" reason={access.error ?? 'Modulo PDV/Caixa desativado.'} />;
  }

  const handleOpenSession = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const opened = await openPdvSession({
        ...headers,
        openingBalance: parseMoneyInput(openingBalanceInput),
      });
      setOpenSession(opened);
      await loadSessionDetails(opened);
      setSessions(await listPdvSessions(headers));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao abrir caixa.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseSession = async () => {
    if (!openSession?.id) return;
    const expected = summary?.expectedCashAmount ?? 0;
    const declared = declaredCashInput.trim() ? parseMoneyInput(declaredCashInput) : expected;
    const difference = Number((declared - expected).toFixed(2));
    if (Math.abs(difference) >= 0.01 && !closureNotesInput.trim()) {
      setActiveTab('conference');
      setError('Informe uma justificativa antes de fechar o caixa com divergencia.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await closePdvSession({
        ...headers,
        sessionId: openSession.id,
        declaredCashAmount: parseMoneyInput(declaredCashInput),
        closureNotes: closureNotesInput.trim() || undefined,
      });
      setOpenSession(null);
      setSummary(null);
      setLedger([]);
      setOperatorSummary(null);
      setDivergence(null);
      setDialog(null);
      setClosureNotesInput('');
      setDeclaredCashInput('');
      setSessions(await listPdvSessions(headers));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao fechar caixa.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddMovement = async () => {
    if (!openSession?.id || dialog === null) return;
    setActionLoading(true);
    setError(null);
    try {
      await createPdvMovement({
        ...headers,
        sessionId: openSession.id,
        type: dialog,
        amount: parseMoneyInput(movementAmount),
        reason: movementReason.trim() || undefined,
      });
      setMovementAmount('');
      setMovementReason('');
      setDialog(null);
      await loadSessionDetails(openSession);
      setSessions(await listPdvSessions(headers));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar movimentacao.');
    } finally {
      setActionLoading(false);
    }
  };

  const expectedCash = summary?.expectedCashAmount ?? 0;
  const declaredCash = declaredCashInput.trim() ? parseMoneyInput(declaredCashInput) : expectedCash;
  const projectedDifference = Number((declaredCash - expectedCash).toFixed(2));
  const hasClosingDivergence = Math.abs(projectedDifference) >= 0.01;
  const hasClosureNotes = closureNotesInput.trim().length > 0;
  const canCloseSession = Boolean(openSession) && !actionLoading && (!hasClosingDivergence || hasClosureNotes);
  const closeBlockReason = !openSession
    ? 'Abra um caixa antes de realizar fechamento.'
    : hasClosingDivergence && !hasClosureNotes
      ? 'Justifique a divergencia para liberar o fechamento.'
      : null;
  const conferenceChecklist = [
    {
      label: 'Turno aberto',
      ok: Boolean(openSession),
      hint: openSession ? `Sessao ${openSession.id.slice(0, 8)}` : 'Nenhum caixa aberto.',
    },
    {
      label: 'Resumo carregado',
      ok: Boolean(summary),
      hint: summary ? `${summary.ordersCount ?? 0} pedido(s) no turno.` : 'Aguardando resumo do caixa.',
    },
    {
      label: 'Valor contado',
      ok: declaredCashInput.trim().length > 0,
      hint: declaredCashInput.trim() ? currency(declaredCash) : 'Informe o valor conferido no caixa.',
    },
    {
      label: 'Divergencia',
      ok: !hasClosingDivergence || hasClosureNotes,
      hint: hasClosingDivergence
        ? hasClosureNotes
          ? `Justificada: ${currency(projectedDifference)}`
          : `Pendente: ${currency(projectedDifference)}`
        : 'Sem divergencia prevista.',
    },
  ];
  const totalMovements = (summary?.supplies ?? 0) + (summary?.adjustments ?? 0) - (summary?.withdrawals ?? 0);
  const operatorLabel = operatorSummary?.operator.label ?? 'Admin MenuHub';

  return (
    <main className={styles.page}>
      <PageHeader
        title="Caixa"
        subtitle="Operacoes, sangrias, suprimentos, vendas e fechamento do turno."
        right={
          <div className={styles.headerStatus}>
            <Badge tone={openSession ? 'success' : 'danger'}>{openSession ? 'Caixa aberto' : 'Caixa fechado'}</Badge>
            <span>{openSession ? `Aberto em ${dateTime(openSession.openedAt)}` : 'Nenhum turno aberto'}</span>
          </div>
        }
      />

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.commandBar} aria-label="Comandos do caixa">
        <a href="/admin/orders">
          <strong>Gestao de pedidos</strong>
          <small>Fila e historico</small>
        </a>
        <button type="button" className={styles.commandActive} onClick={() => setActiveTab('operations')}>
          <strong>Caixa</strong>
          <small>Livro do turno</small>
        </button>
        <button type="button" onClick={() => setActiveTab('previous')}>
          <strong>Caixas anteriores</strong>
          <small>{sessions.length} registro(s)</small>
        </button>
        <button type="button" onClick={() => setActiveTab('conference')} disabled={!openSession}>
          <strong>Fechar caixa</strong>
          <small>Conferencia final</small>
        </button>
        <button type="button" onClick={() => setDialog('WITHDRAWAL')} disabled={!openSession}>
          <strong>Sangria</strong>
          <small>Retirada manual</small>
        </button>
        <button type="button" onClick={() => setDialog('SUPPLY')} disabled={!openSession}>
          <strong>Suprimento</strong>
          <small>Entrada manual</small>
        </button>
      </section>

      <section className={styles.sessionPanel}>
        <div className={styles.sessionIntro}>
          <span>Turno atual</span>
          <h2>{openSession ? 'Caixa aberto' : 'Caixa fechado'}</h2>
          <p>
            {openSession
              ? `Aberto em ${dateTime(openSession.openedAt)} por ${operatorLabel}.`
              : 'Abra o caixa para liberar vendas presenciais, suprimentos, sangrias e fechamento.'}
          </p>
        </div>

        <div className={styles.sessionStats}>
          <div>
            <small>Saldo inicial</small>
            <strong>{currency(openSession?.openingBalance ?? 0)}</strong>
          </div>
          <div>
            <small>Pedidos</small>
            <strong>{summary?.ordersCount ?? 0}</strong>
          </div>
          <div>
            <small>Movimentacoes</small>
            <strong>{summary?.movementsCount ?? 0}</strong>
          </div>
          <div>
            <small>Operador</small>
            <strong>{operatorLabel}</strong>
          </div>
        </div>

        {!openSession ? (
          <div className={styles.openInline}>
            <label>
              Saldo inicial
              <Input value={openingBalanceInput} onChange={(event) => setOpeningBalanceInput(event.target.value)} placeholder="0,00" />
            </label>
            <Button variant="primary" onClick={() => void handleOpenSession()} disabled={actionLoading}>
              {actionLoading ? 'Abrindo...' : 'Abrir caixa'}
            </Button>
          </div>
        ) : (
          <div className={styles.quickActions}>
            <Button onClick={() => setDialog('SUPPLY')}>Suprimento</Button>
            <Button onClick={() => setDialog('WITHDRAWAL')}>Sangria</Button>
            <Button onClick={() => setDialog('ADJUSTMENT')}>Ajuste</Button>
            <Button variant="danger" onClick={() => setActiveTab('conference')}>Conferir fechamento</Button>
          </div>
        )}
      </section>

      <section className={styles.metricsGrid}>
        <Card className={styles.metricCard}>
          <span>Total vendido</span>
          <strong>{currency(summary?.totalSales ?? 0)}</strong>
          <small>{summary?.ordersCount ?? 0} pedidos no caixa atual</small>
        </Card>
        <Card className={styles.metricCard}>
          <span>Caixa esperado</span>
          <strong>{currency(expectedCash)}</strong>
          <small>Inclui saldo inicial, suprimentos e sangrias</small>
        </Card>
        <Card className={styles.metricCard}>
          <span>Ticket medio</span>
          <strong>{currency(summary?.averageTicket ?? 0)}</strong>
          <small>Venda presencial e PDV</small>
        </Card>
        <Card className={styles.metricCard}>
          <span>Movimentos manuais</span>
          <strong className={differenceTone(totalMovements)}>{currency(totalMovements)}</strong>
          <small>Suprimentos, sangrias e ajustes</small>
        </Card>
      </section>

      <Card className={styles.paymentSummaryPanel}>
        <div className={styles.panelTitle}>
          <div>
            <span>Resumo do caixa</span>
            <h2>Vendas por forma de pagamento</h2>
          </div>
          <Badge tone={openSession ? 'success' : 'default'}>{paymentBreakdown.length} forma(s)</Badge>
        </div>
        <div className={styles.paymentSummaryGrid}>
          {paymentBreakdown.map((item) => (
            <div key={item.label}>
              <small>{item.label}</small>
              <strong>{currency(item.amount)}</strong>
              <span>{item.count || 0} lancamento(s)</span>
            </div>
          ))}
          {paymentBreakdown.length === 0 ? (
            <div className={styles.summaryEmpty}>
              <small>Sem vendas</small>
              <strong>{currency(0)}</strong>
              <span>Abra o caixa ou registre pedidos para alimentar o resumo.</span>
            </div>
          ) : null}
        </div>
      </Card>

      <Card className={styles.workspace}>
        <div className={styles.tabRow}>
          <button className={activeTab === 'operations' ? styles.activeTab : ''} onClick={() => setActiveTab('operations')} type="button">
            Movimentacoes
          </button>
          <button className={activeTab === 'conference' ? styles.activeTab : ''} onClick={() => setActiveTab('conference')} type="button">
            Conferencia
          </button>
          <button className={activeTab === 'previous' ? styles.activeTab : ''} onClick={() => setActiveTab('previous')} type="button">
            Historico
          </button>
        </div>

        {loading ? <LoadingState label="Carregando caixa..." /> : null}

        {activeTab === 'operations' ? (
          <div className={styles.panelBlock}>
            <div className={styles.panelTitle}>
              <div>
                <span>Livro caixa</span>
                <h2>Movimentacoes do turno</h2>
              </div>
              <Badge tone={openSession ? 'success' : 'default'}>{filteredLedger.length} registros</Badge>
            </div>
            <div className={styles.toolbar}>
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquise pela descricao" />
              <Select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
                {paymentOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </Select>
              <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'ALL' | PdvMovementType)}>
                {typeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </div>
            <div className={styles.tableShell}>
              <table className={styles.cashTable}>
                <thead>
                  <tr>
                    <th>Data/Hora</th>
                    <th>Descricao</th>
                    <th>Valor</th>
                    <th>Forma de pagamento</th>
                    <th>Tipo</th>
                    <th>Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLedger.map((entry) => (
                    <tr key={entry.id}>
                      <td>{dateTime(entry.createdAt)}</td>
                      <td>
                        <strong>{entry.description}</strong>
                        {entry.orderNumber ? <small>Pedido {entry.orderNumber}</small> : null}
                      </td>
                      <td>{currency(entry.amount)}</td>
                      <td>{entry.paymentMethod}</td>
                      <td><Badge tone={entry.type === 'WITHDRAWAL' ? 'danger' : 'default'}>{movementLabel(entry.type)}</Badge></td>
                      <td>{entry.userLabel}</td>
                    </tr>
                  ))}
                  {filteredLedger.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={styles.emptyCell}>Nenhuma movimentacao encontrada para os filtros atuais.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeTab === 'conference' ? (
          <div className={styles.conferenceGrid}>
            <div className={styles.closePanel}>
              <div className={styles.panelTitle}>
                <div>
                  <span>Fechamento</span>
                  <h2>Conferencia do caixa</h2>
                </div>
                <Badge tone={openSession ? 'success' : 'danger'}>{openSession ? 'Turno aberto' : 'Sem turno'}</Badge>
              </div>
              <div className={styles.closeMetrics}>
                <div>
                  <small>Dinheiro esperado</small>
                  <strong>{currency(expectedCash)}</strong>
                </div>
                <div>
                  <small>Valor contado</small>
                  <strong>{currency(declaredCash)}</strong>
                </div>
                <div>
                  <small>Diferenca prevista</small>
                  <strong className={differenceTone(projectedDifference)}>{currency(projectedDifference)}</strong>
                </div>
              </div>
              <div className={styles.closeChecklist}>
                {conferenceChecklist.map((item) => (
                  <div key={item.label} className={item.ok ? styles.checklistOk : styles.checklistPending}>
                    <strong>{item.label}</strong>
                    <span>{item.hint}</span>
                  </div>
                ))}
              </div>
              <label>
                Valor declarado no caixa
                <Input value={declaredCashInput} onChange={(event) => setDeclaredCashInput(event.target.value)} placeholder="0,00" />
              </label>
              <label>
                Justificativa se houver divergencia
                <textarea value={closureNotesInput} onChange={(event) => setClosureNotesInput(event.target.value)} placeholder="Informe observacoes do fechamento" />
              </label>
              {closeBlockReason ? <div className={styles.closeBlockReason}>{closeBlockReason}</div> : null}
              <div className={styles.closeActions}>
                <Button onClick={() => setActiveTab('operations')}>Voltar para movimentos</Button>
                <Button variant="danger" onClick={() => void handleCloseSession()} disabled={!canCloseSession}>
                  {actionLoading ? 'Fechando...' : 'Fechar caixa'}
                </Button>
              </div>
            </div>
            <div className={styles.closePanel}>
              <div className={styles.panelTitle}>
                <div>
                  <span>Resumo</span>
                  <h2>Pagamentos e divergencias</h2>
                </div>
              </div>
              <div className={styles.paymentGrid}>
                <div><small>Dinheiro</small><strong>{currency(summary?.totalsByMethod.cash ?? 0)}</strong></div>
                <div><small>PIX</small><strong>{currency(summary?.totalsByMethod.pix ?? 0)}</strong></div>
                <div><small>Cartao</small><strong>{currency(summary?.totalsByMethod.card ?? 0)}</strong></div>
                <div><small>Nivel</small><strong>{divergence?.divergenceSeverity ?? 'none'}</strong></div>
              </div>
              <div className={styles.operatorBox}>
                <span>Operador responsavel</span>
                <strong>{operatorLabel}</strong>
                <small>{operatorSummary?.ordersCount ?? summary?.ordersCount ?? 0} pedidos vinculados ao turno atual</small>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'previous' ? (
          <div className={styles.tableShell}>
            <table className={styles.cashTable}>
              <thead>
                <tr>
                  <th>Abertura</th>
                  <th>Fechamento</th>
                  <th>Status</th>
                  <th>Saldo inicial</th>
                  <th>Esperado</th>
                  <th>Declarado</th>
                  <th>Diferenca</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>{dateTime(session.openedAt)}</td>
                    <td>{dateTime(session.closedAt)}</td>
                    <td><Badge tone={session.status === 'OPEN' ? 'success' : 'default'}>{session.status === 'OPEN' ? 'Aberto' : 'Fechado'}</Badge></td>
                    <td>{currency(session.openingBalance)}</td>
                    <td>{currency(session.expectedCashAmount)}</td>
                    <td>{session.declaredCashAmount === null ? '-' : currency(session.declaredCashAmount)}</td>
                    <td className={differenceTone(session.cashDifference)}>{session.cashDifference === null ? '-' : currency(session.cashDifference)}</td>
                  </tr>
                ))}
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={styles.emptyCell}>Nenhum caixa anterior encontrado.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {dialog ? (
        <div className={styles.modalOverlay} role="presentation">
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label={dialogTitle(dialog)}>
            <div className={styles.modalHeader}>
              <h2>{dialogTitle(dialog)}</h2>
              <button type="button" onClick={() => setDialog(null)} aria-label="Fechar">x</button>
            </div>
            <div className={styles.closeGrid}>
              <label>
                Valor
                <Input value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} placeholder="0,00" />
              </label>
              <label>
                Motivo
                <Input value={movementReason} onChange={(event) => setMovementReason(event.target.value)} placeholder="Informe o motivo" />
              </label>
              <div className={styles.modalActions}>
                <Button onClick={() => setDialog(null)} disabled={actionLoading}>Cancelar</Button>
                <Button variant="primary" onClick={() => void handleAddMovement()} disabled={actionLoading}>
                  {actionLoading ? 'Lancando...' : 'Lancar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
