'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  closeTableSession,
  createTable,
  listOpenCommands,
  listTables,
  mergeCommands,
  openTableSession,
  splitCommand,
  transferTableSession,
  updateTable,
  type OpenCommand,
  type TableItem,
  type TableStatus,
} from '@/features/tables/tables.api';
import styles from './page.module.css';

const statusLabel: Record<TableStatus, string> = {
  FREE: 'Livre',
  OCCUPIED: 'Ocupada',
  RESERVED: 'Reservada',
  CLEANING: 'Limpeza',
};

const statusTone: Record<TableStatus, 'default' | 'success' | 'warning' | 'danger'> = {
  FREE: 'success',
  OCCUPIED: 'warning',
  RESERVED: 'default',
  CLEANING: 'danger',
};

function currency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function commandTotal(command: OpenCommand) {
  return (command.orders ?? []).reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0);
}

function minutesSince(isoDate: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000));
}

export default function AdminTablesPage() {
  const [tables, setTables] = useState<TableItem[]>([]);
  const [commands, setCommands] = useState<OpenCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tableName, setTableName] = useState('');
  const [tableCapacity, setTableCapacity] = useState('4');
  const [guestByTable, setGuestByTable] = useState<Record<string, string>>({});
  const [transferBySession, setTransferBySession] = useState<Record<string, string>>({});
  const [selectedCommands, setSelectedCommands] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | TableStatus>('all');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [tableRows, commandRows] = await Promise.all([listTables(), listOpenCommands()]);
      setTables(tableRows);
      setCommands(commandRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar mesas/comandas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const commandByTableId = useMemo(() => {
    const map = new Map<string, OpenCommand>();
    for (const command of commands) {
      if (command.tableRestaurant?.id) map.set(command.tableRestaurant.id, command);
    }
    return map;
  }, [commands]);

  const filteredTables = useMemo(
    () => tables.filter((table) => statusFilter === 'all' || table.status === statusFilter),
    [statusFilter, tables],
  );

  const summary = useMemo(() => {
    const occupied = tables.filter((table) => table.sessions?.[0] || table.status === 'OCCUPIED').length;
    const free = tables.filter((table) => table.status === 'FREE' && !table.sessions?.[0]).length;
    const reserved = tables.filter((table) => table.status === 'RESERVED').length;
    const cleaning = tables.filter((table) => table.status === 'CLEANING').length;
    const totalOpen = commands.reduce((sum, command) => sum + commandTotal(command), 0);
    return { occupied, free, reserved, cleaning, totalOpen };
  }, [commands, tables]);

  async function onCreateTable(event: FormEvent) {
    event.preventDefault();
    setSaving('create');
    setError(null);
    setNotice(null);
    try {
      await createTable({ name: tableName, capacity: Number(tableCapacity || '1') });
      setTableName('');
      setTableCapacity('4');
      setNotice('Mesa criada com sucesso.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar mesa.');
    } finally {
      setSaving(null);
    }
  }

  async function onOpenSession(tableId: string) {
    setSaving(`open-${tableId}`);
    setError(null);
    setNotice(null);
    try {
      await openTableSession(tableId, { guestCount: Number(guestByTable[tableId] || '1') });
      setNotice('Comanda aberta.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao abrir comanda.');
    } finally {
      setSaving(null);
    }
  }

  async function onCloseSession(sessionId: string) {
    setSaving(`close-${sessionId}`);
    setError(null);
    setNotice(null);
    try {
      await closeTableSession(sessionId);
      setNotice('Comanda fechada e mesa liberada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao fechar comanda.');
    } finally {
      setSaving(null);
    }
  }

  async function onTransfer(sessionId: string) {
    const toTableId = transferBySession[sessionId];
    if (!toTableId) {
      setError('Selecione a mesa destino para transferencia.');
      return;
    }
    setSaving(`transfer-${sessionId}`);
    setError(null);
    setNotice(null);
    try {
      await transferTableSession(sessionId, toTableId);
      setNotice('Mesa transferida com sucesso.');
      setTransferBySession((prev) => ({ ...prev, [sessionId]: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao transferir mesa.');
    } finally {
      setSaving(null);
    }
  }

  async function onUpdateStatus(tableId: string, status: TableStatus) {
    setSaving(`status-${tableId}`);
    setError(null);
    setNotice(null);
    try {
      await updateTable(tableId, { status });
      setNotice(`Mesa marcada como ${statusLabel[status].toLowerCase()}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar status da mesa.');
    } finally {
      setSaving(null);
    }
  }

  async function onSplit(commandId: string, byGuests: boolean) {
    setSaving(`split-${commandId}`);
    setError(null);
    setNotice(null);
    try {
      const result = await splitCommand(commandId, byGuests);
      setNotice(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao separar conta.');
    } finally {
      setSaving(null);
    }
  }

  async function onMergeSelected() {
    setSaving('merge');
    setError(null);
    setNotice(null);
    try {
      const result = await mergeCommands(selectedCommands);
      setNotice(result.message);
      setSelectedCommands([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao juntar comandas.');
    } finally {
      setSaving(null);
    }
  }

  function toggleCommand(commandId: string) {
    setSelectedCommands((prev) => (prev.includes(commandId) ? prev.filter((id) => id !== commandId) : [...prev, commandId]));
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Carregando mesas e comandas..." />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="Mesas e Comandas"
        subtitle="Salao em tempo real para abrir mesa, acompanhar consumo, transferir e fechar comandas."
        right={<Button onClick={() => void load()}>Atualizar</Button>}
      />

      {error ? <Card className={styles.error}>{error}</Card> : null}
      {notice ? <Card className={styles.notice}>{notice}</Card> : null}

      <section className={styles.summaryGrid}>
        <Card className={styles.summaryCard}><span>Mesas livres</span><strong>{summary.free}</strong></Card>
        <Card className={styles.summaryCard}><span>Ocupadas</span><strong>{summary.occupied}</strong></Card>
        <Card className={styles.summaryCard}><span>Reservadas</span><strong>{summary.reserved}</strong></Card>
        <Card className={styles.summaryCard}><span>Limpeza</span><strong>{summary.cleaning}</strong></Card>
        <Card className={styles.summaryCard}><span>Consumo aberto</span><strong>{currency(summary.totalOpen)}</strong></Card>
      </section>

      <section className={styles.workspace}>
        <Card className={styles.createPanel}>
          <div className={styles.panelHeader}>
            <div>
              <small>Mapa do salao</small>
              <h2>Nova mesa</h2>
            </div>
            <Badge>{tables.length} mesas</Badge>
          </div>
          <form className={styles.form} onSubmit={onCreateTable}>
            <Input placeholder="Nome da mesa (ex: M12)" value={tableName} onChange={(e) => setTableName(e.target.value)} />
            <Input type="number" min="1" placeholder="Capacidade" value={tableCapacity} onChange={(e) => setTableCapacity(e.target.value)} />
            <Button type="submit" variant="primary" disabled={saving === 'create'}>{saving === 'create' ? 'Criando...' : 'Criar mesa'}</Button>
          </form>
        </Card>

        <Card className={styles.filterPanel}>
          <div className={styles.panelHeader}>
            <div>
              <small>Filtro operacional</small>
              <h2>Status</h2>
            </div>
          </div>
          <div className={styles.filterPills}>
            <button className={statusFilter === 'all' ? styles.activePill : ''} onClick={() => setStatusFilter('all')}>Todas</button>
            {Object.entries(statusLabel).map(([key, label]) => (
              <button key={key} className={statusFilter === key ? styles.activePill : ''} onClick={() => setStatusFilter(key as TableStatus)}>{label}</button>
            ))}
          </div>
        </Card>
      </section>

      <section className={styles.grid}>
        {filteredTables.length === 0 ? <EmptyState title="Sem mesas nesse filtro" description="Ajuste o filtro ou crie uma nova mesa." /> : null}
        {filteredTables.map((table) => {
          const openSession = table.sessions?.[0];
          const command = commandByTableId.get(table.id);
          const freeTargets = tables.filter((item) => item.id !== table.id && !item.sessions?.[0] && item.status !== 'OCCUPIED');
          return (
            <Card key={table.id} className={`${styles.tableCard} ${openSession ? styles.occupiedCard : ''}`}>
              <div className={styles.tableTop}>
                <div>
                  <small>Mesa</small>
                  <h3>{table.name}</h3>
                </div>
                <Badge tone={statusTone[table.status]}>{statusLabel[table.status]}</Badge>
              </div>

              <div className={styles.tableFacts}>
                <span>Capacidade: <strong>{table.capacity}</strong></span>
                <span>Comanda: <strong>{command?.code ?? '-'}</strong></span>
                <span>Pedidos: <strong>{command?.orders?.length ?? 0}</strong></span>
                <span>Total: <strong>{currency(command ? commandTotal(command) : 0)}</strong></span>
              </div>

              {openSession ? (
                <div className={styles.sessionBox}>
                  <strong>{openSession.guestCount} pessoas</strong>
                  <span>Aberta ha {minutesSince(openSession.openedAt)} min</span>
                  <div className={styles.actionsInline}>
                    <Button onClick={() => window.location.assign('/admin/pdv')} disabled={Boolean(saving)}>Enviar pedido</Button>
                    <Button variant="danger" onClick={() => void onCloseSession(openSession.id)} disabled={saving === `close-${openSession.id}`}>Fechar</Button>
                  </div>
                  <div className={styles.transferRow}>
                    <Select value={transferBySession[openSession.id] ?? ''} onChange={(e) => setTransferBySession((prev) => ({ ...prev, [openSession.id]: e.target.value }))}>
                      <option value="">Mesa destino</option>
                      {freeTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                    </Select>
                    <Button onClick={() => void onTransfer(openSession.id)} disabled={saving === `transfer-${openSession.id}`}>Transferir</Button>
                  </div>
                </div>
              ) : (
                <div className={styles.openBox}>
                  <Input placeholder="Pessoas" type="number" min="1" value={guestByTable[table.id] ?? '2'} onChange={(e) => setGuestByTable((prev) => ({ ...prev, [table.id]: e.target.value }))} />
                  <Button variant="primary" onClick={() => void onOpenSession(table.id)} disabled={saving === `open-${table.id}`}>Abrir comanda</Button>
                </div>
              )}

              <div className={styles.statusActions}>
                <button onClick={() => void onUpdateStatus(table.id, 'RESERVED')} disabled={Boolean(openSession) || saving === `status-${table.id}`}>Reservar</button>
                <button onClick={() => void onUpdateStatus(table.id, 'CLEANING')} disabled={Boolean(openSession) || saving === `status-${table.id}`}>Limpeza</button>
                <button onClick={() => void onUpdateStatus(table.id, 'FREE')} disabled={Boolean(openSession) || saving === `status-${table.id}`}>Liberar</button>
              </div>
            </Card>
          );
        })}
      </section>

      <Card className={styles.commandsPanel}>
        <div className={styles.panelHeader}>
          <div>
            <small>Comandas abertas</small>
            <h2>Contas em andamento</h2>
          </div>
          <div className={styles.actionsInline}>
            <Badge>{commands.length} abertas</Badge>
            <Button onClick={() => void onMergeSelected()} disabled={selectedCommands.length < 2 || saving === 'merge'}>Juntar selecionadas</Button>
          </div>
        </div>
        {commands.length === 0 ? <EmptyState title="Sem comandas abertas" description="Abra uma mesa para iniciar consumo local." /> : null}
        <div className={styles.commandsList}>
          {commands.map((command) => (
            <article key={command.id} className={styles.commandRow}>
              <label className={styles.checkCell}>
                <input type="checkbox" checked={selectedCommands.includes(command.id)} onChange={() => toggleCommand(command.id)} />
              </label>
              <div>
                <strong>{command.code}</strong>
                <p>Mesa: {command.tableRestaurant?.name ?? '-'}</p>
              </div>
              <div>
                <span>{command.guestCount} pessoas</span>
                <p>{minutesSince(command.openedAt)} min aberta</p>
              </div>
              <div>
                <span>{command.orders?.length ?? 0} pedidos</span>
                <p>{currency(commandTotal(command))}</p>
              </div>
              <div className={styles.actionsInline}>
                <Button onClick={() => void onSplit(command.id, true)} disabled={saving === `split-${command.id}`}>Por pessoa</Button>
                <Button onClick={() => void onSplit(command.id, false)} disabled={saving === `split-${command.id}`}>Igual</Button>
              </div>
            </article>
          ))}
        </div>
      </Card>
    </main>
  );
}
