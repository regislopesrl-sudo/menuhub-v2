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

type ViewMode = 'floor' | 'commands' | 'settings';
type EntityType = 'MESA' | 'COMANDA';

const commandShortcuts = [
  { id: 'orders', label: 'Gestao de pedidos', description: 'Fila e historico' },
  { id: 'tables', label: 'Mesas/Comandas', description: 'Consumo local' },
  { id: 'cash', label: 'Caixa', description: 'Abertura e fechamento' },
  { id: 'history', label: 'Historico de pedidos', description: 'Pedidos finalizados' },
  { id: 'customers', label: 'Clientes', description: 'Cadastro e relacionamento' },
  { id: 'settings', label: 'Configuracoes', description: 'Mesas e comandas' },
] as const;

const statusLabel: Record<TableStatus, string> = {
  FREE: 'Livre',
  OCCUPIED: 'Ocupada',
  RESERVED: 'Reservada',
  BLOCKED: 'Inativa',
};

const statusTone: Record<TableStatus, 'default' | 'success' | 'warning' | 'danger'> = {
  FREE: 'success',
  OCCUPIED: 'warning',
  RESERVED: 'default',
  BLOCKED: 'danger',
};

function currency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function commandTotal(command?: OpenCommand) {
  return (command?.orders ?? []).reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0);
}

function minutesSince(isoDate: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000));
}

function formatElapsed(minutes: number) {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const dayHours = hours % 24;
  return dayHours ? `${days}d ${dayHours}h` : `${days}d`;
}

function tableType(table: Pick<TableItem, 'name'>): EntityType {
  return table.name.toLowerCase().includes('comanda') ? 'COMANDA' : 'MESA';
}

function tableNumber(table: Pick<TableItem, 'name'>) {
  const match = table.name.match(/(\d+)/);
  return (match?.[1] ?? table.name.replace(/mesa|comanda/gi, '').trim()) || table.name;
}

function buildEntityName(type: EntityType, rawNumber: string) {
  const trimmed = rawNumber.trim();
  if (!trimmed) return '';
  if (/mesa|comanda/i.test(trimmed)) return trimmed.toUpperCase();
  const padded = /^\d+$/.test(trimmed) ? trimmed.padStart(2, '0') : trimmed;
  return `${type} ${padded}`;
}

function commandCodeFor(table: TableItem) {
  return tableType(table) === 'COMANDA' ? table.name : `MESA-${tableNumber(table)}`;
}

function pdvUrlFor(table: TableItem, command?: OpenCommand) {
  const type = tableType(table);
  const params = new URLSearchParams({
    saleType: type === 'MESA' ? 'TABLE' : 'COMMAND',
    commandReference: command?.code ?? commandCodeFor(table),
    tableId: table.id,
  });
  if (command?.id) params.set('commandId', command.id);
  return `/admin/pdv?${params.toString()}`;
}

export default function AdminTablesPage() {
  const [tables, setTables] = useState<TableItem[]>([]);
  const [commands, setCommands] = useState<OpenCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('floor');
  const [searchTerm, setSearchTerm] = useState('');
  const [configSearch, setConfigSearch] = useState('');
  const [entityType, setEntityType] = useState<EntityType>('COMANDA');
  const [typeFilter, setTypeFilter] = useState<'all' | EntityType>('all');
  const [entityNumber, setEntityNumber] = useState('');
  const [tableCapacity, setTableCapacity] = useState('1');
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

  const filteredTables = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return tables.filter((table) => {
      const command = commandByTableId.get(table.id);
      const text = `${table.name} ${command?.code ?? ''} ${table.status}`.toLowerCase();
      const matchesSearch = !term || text.includes(term);
      const matchesStatus = statusFilter === 'all' || table.status === statusFilter;
      const matchesType = typeFilter === 'all' || tableType(table) === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [commandByTableId, searchTerm, statusFilter, tables, typeFilter]);

  const configRows = useMemo(() => {
    const term = configSearch.trim().toLowerCase();
    return tables.filter((table) => !term || `${table.name} ${table.status}`.toLowerCase().includes(term));
  }, [configSearch, tables]);

  const summary = useMemo(() => {
    const occupied = tables.filter((table) => table.sessions?.[0] || table.status === 'OCCUPIED').length;
    const free = tables.filter((table) => table.status === 'FREE' && !table.sessions?.[0]).length;
    const reserved = tables.filter((table) => table.status === 'RESERVED').length;
    const blocked = tables.filter((table) => table.status === 'BLOCKED').length;
    const tableCount = tables.filter((table) => tableType(table) === 'MESA').length;
    const commandCount = tables.filter((table) => tableType(table) === 'COMANDA').length;
    const totalOpen = commands.reduce((sum, command) => sum + commandTotal(command), 0);
    const guests = commands.reduce((sum, command) => sum + Number(command.guestCount ?? 0), 0);
    return { occupied, free, reserved, blocked, tableCount, commandCount, totalOpen, guests, total: tables.length };
  }, [commands, tables]);

  function runShortcut(shortcutId: (typeof commandShortcuts)[number]['id']) {
    if (shortcutId === 'orders') {
      window.location.assign('/admin/orders');
      return;
    }
    if (shortcutId === 'cash') {
      window.location.assign('/admin/cash');
      return;
    }
    if (shortcutId === 'history') {
      window.location.assign('/admin/orders?scope=history');
      return;
    }
    if (shortcutId === 'customers') {
      window.location.assign('/admin/crm');
      return;
    }
    if (shortcutId === 'settings') {
      setViewMode('settings');
      return;
    }
    setViewMode('floor');
  }

  async function onCreateTable(event: FormEvent) {
    event.preventDefault();
    const name = buildEntityName(entityType, entityNumber);
    if (!name) {
      setError('Informe o numero da mesa/comanda.');
      return;
    }
    setSaving('create');
    setError(null);
    setNotice(null);
    try {
      await createTable({ name, capacity: Number(tableCapacity || '1') });
      setEntityNumber('');
      setTableCapacity(entityType === 'COMANDA' ? '1' : '4');
      setNotice(`${entityType === 'COMANDA' ? 'Comanda' : 'Mesa'} criada com sucesso.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar mesa/comanda.');
    } finally {
      setSaving(null);
    }
  }

  async function onOpenSession(table: TableItem) {
    setSaving(`open-${table.id}`);
    setError(null);
    setNotice(null);
    try {
      await openTableSession(table.id, {
        guestCount: Number(guestByTable[table.id] || '1'),
        commandCode: commandCodeFor(table),
      });
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
      setError('Selecione a mesa/comanda destino para transferencia.');
      return;
    }
    setSaving(`transfer-${sessionId}`);
    setError(null);
    setNotice(null);
    try {
      await transferTableSession(sessionId, toTableId);
      setNotice('Transferencia realizada com sucesso.');
      setTransferBySession((prev) => ({ ...prev, [sessionId]: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao transferir mesa/comanda.');
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
      setNotice(`Registro marcado como ${statusLabel[status].toLowerCase()}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar status.');
    } finally {
      setSaving(null);
    }
  }

  async function onToggleActive(table: TableItem) {
    const nextStatus: TableStatus = table.status === 'BLOCKED' ? 'FREE' : 'BLOCKED';
    await onUpdateStatus(table.id, nextStatus);
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
        title={
          viewMode === 'floor'
            ? 'Mesas e Comandas'
            : viewMode === 'commands'
              ? 'Comandas abertas'
              : 'Configurar Mesas e Comandas'
        }
        subtitle={
          viewMode === 'floor'
            ? 'Operacao do salao, consumo aberto, transferencia e fechamento de comandas.'
            : viewMode === 'commands'
              ? 'Controle das comandas abertas, divisao, juncao e fechamento operacional.'
            : 'Crie mesas e comandas, ative/desative registros e gere QR Codes locais.'
        }
        right={
          <div className={styles.headerActions}>
            <Button onClick={() => setViewMode(viewMode === 'settings' ? 'floor' : 'settings')}>
              {viewMode === 'settings' ? 'Voltar ao salao' : 'Configurar'}
            </Button>
            <Button onClick={() => void load()}>Atualizar</Button>
          </div>
        }
      />

      <div className={styles.viewTabs}>
        <button type="button" className={viewMode === 'floor' ? styles.activeTab : ''} onClick={() => setViewMode('floor')}>
          Mesas/Comandas
        </button>
        <button type="button" className={viewMode === 'commands' ? styles.activeTab : ''} onClick={() => setViewMode('commands')}>
          Comandas abertas
        </button>
        <button type="button" className={viewMode === 'settings' ? styles.activeTab : ''} onClick={() => setViewMode('settings')}>
          Configuracao
        </button>
      </div>

      {error ? <Card className={styles.error}>{error}</Card> : null}
      {notice ? <Card className={styles.notice}>{notice}</Card> : null}

      <Card className={styles.commandBar}>
        {commandShortcuts.map((shortcut) => {
          const isActive =
            (shortcut.id === 'tables' && viewMode === 'floor') ||
            (shortcut.id === 'settings' && viewMode === 'settings');
          return (
            <button
              key={shortcut.id}
              type="button"
              className={isActive ? styles.commandActive : ''}
              onClick={() => runShortcut(shortcut.id)}
            >
              <strong>{shortcut.label}</strong>
              <span>{shortcut.description}</span>
            </button>
          );
        })}
      </Card>

      <section className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <span>Mesas</span>
          <strong>{summary.tableCount}</strong>
          <small>Registros de salao</small>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Comandas</span>
          <strong>{summary.commandCount}</strong>
          <small>Contas de consumo</small>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Livres</span>
          <strong>{summary.free}</strong>
          <small>Prontas para abrir</small>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Ocupadas</span>
          <strong>{summary.occupied}</strong>
          <small>Consumo em andamento</small>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Total aberto</span>
          <strong>{currency(summary.totalOpen)}</strong>
          <small>Vendas vinculadas</small>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Pessoas</span>
          <strong>{summary.guests}</strong>
          <small>Em comandas abertas</small>
        </Card>
      </section>

      {viewMode === 'floor' ? (
        <>
          <Card className={styles.operationBar}>
            <div className={styles.searchBox}>
              <Input placeholder="Buscar (mesa, comanda ou codigo)" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </div>
            <div className={styles.typeStrip}>
              <button className={typeFilter === 'all' ? styles.typeActive : ''} onClick={() => setTypeFilter('all')}>Todos</button>
              <button className={typeFilter === 'MESA' ? styles.typeActive : ''} onClick={() => setTypeFilter('MESA')}>Mesas</button>
              <button className={typeFilter === 'COMANDA' ? styles.typeActive : ''} onClick={() => setTypeFilter('COMANDA')}>Comandas</button>
            </div>
            <div className={styles.counterStrip}>
              <button className={statusFilter === 'FREE' ? styles.counterActive : ''} onClick={() => setStatusFilter('FREE')}>
                <strong>{summary.free}</strong>
                <span>Livres</span>
              </button>
              <button className={statusFilter === 'OCCUPIED' ? styles.counterActive : ''} onClick={() => setStatusFilter('OCCUPIED')}>
                <strong>{summary.occupied}</strong>
                <span>Ocupadas</span>
              </button>
              <button className={statusFilter === 'all' ? styles.counterActive : ''} onClick={() => setStatusFilter('all')}>
                <strong>{summary.total}</strong>
                <span>Total</span>
              </button>
              <button className={styles.peopleCounter}>
                <strong>{summary.guests}</strong>
                <span>Pessoas</span>
              </button>
            </div>
          </Card>

          <section className={styles.roomGrid}>
            {filteredTables.length === 0 ? <EmptyState title="Sem mesas ou comandas" description="Ajuste a busca/filtro ou crie novos registros em Configuracao." /> : null}
            {filteredTables.map((table) => {
              const openSession = table.sessions?.[0];
              const command = commandByTableId.get(table.id);
              const freeTargets = tables.filter((item) => item.id !== table.id && !item.sessions?.[0] && item.status === 'FREE');
              return (
                <Card
                  key={table.id}
                  className={`${styles.roomCard} ${openSession ? styles.openRoomCard : ''} ${table.status === 'BLOCKED' ? styles.blockedRoomCard : ''}`}
                >
                  {openSession ? (
                    <>
                      <div className={styles.openHeader}>
                        <strong>{command?.code ?? table.name}</strong>
                        <Badge tone="success">Aberta</Badge>
                      </div>
                      <div className={styles.openAmount}>{currency(commandTotal(command))}</div>
                      <div className={styles.openMeta}>
                        <span>Nao informado</span>
                        <span>Atendente</span>
                        <span>{formatElapsed(minutesSince(openSession.openedAt))}</span>
                        <span>{openSession.guestCount} pessoa(s)</span>
                      </div>
                      <div className={styles.openActions}>
                        <Button onClick={() => window.location.assign(pdvUrlFor(table, command))} disabled={Boolean(saving)}>
                          Lancar pedido
                        </Button>
                        <Button variant="danger" onClick={() => void onCloseSession(openSession.id)} disabled={saving === `close-${openSession.id}`}>
                          Fechar
                        </Button>
                      </div>
                      <div className={styles.transferRow}>
                        <Select value={transferBySession[openSession.id] ?? ''} onChange={(event) => setTransferBySession((prev) => ({ ...prev, [openSession.id]: event.target.value }))}>
                          <option value="">Transferir para</option>
                          {freeTargets.map((target) => (
                            <option key={target.id} value={target.id}>
                              {target.name}
                            </option>
                          ))}
                        </Select>
                        <Button onClick={() => void onTransfer(openSession.id)} disabled={saving === `transfer-${openSession.id}`}>
                          Transferir
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={styles.closedRoom}>
                        <span>{tableType(table)}</span>
                        <strong>{tableNumber(table)}</strong>
                        <Badge tone={statusTone[table.status]}>{statusLabel[table.status]}</Badge>
                      </div>
                      {table.status !== 'BLOCKED' ? (
                        <div className={styles.openBox}>
                          <Input placeholder="Pessoas" type="number" min="1" value={guestByTable[table.id] ?? '1'} onChange={(event) => setGuestByTable((prev) => ({ ...prev, [table.id]: event.target.value }))} />
                          <Button variant="primary" onClick={() => void onOpenSession(table)} disabled={saving === `open-${table.id}`}>
                            Abrir
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                </Card>
              );
            })}
          </section>

        </>
      ) : null}

      {viewMode === 'commands' ? (
        <CommandsPanel
          commands={commands}
          selectedCommands={selectedCommands}
          saving={saving}
          summaryTotal={summary.totalOpen}
          onMergeSelected={onMergeSelected}
          onSplit={onSplit}
          toggleCommand={toggleCommand}
        />
      ) : null}

      {viewMode === 'settings' ? (
        <Card className={styles.settingsPanel}>
          <div className={styles.settingsHeader}>
            <div>
              <span className={styles.eyebrow}>Configuracao</span>
              <h2>Configurar Mesas e Comandas</h2>
              <p>Cadastre, pesquise e ative mesas/comandas usadas no PDV e no fechamento de mesa.</p>
            </div>
            <Input placeholder="Pesquise pelo numero" value={configSearch} onChange={(event) => setConfigSearch(event.target.value)} />
          </div>

          <div className={styles.settingsTools}>
            <div className={styles.serviceFee}>Taxa de servico: <strong>0%</strong></div>
            <Button>Baixar QR Codes</Button>
          </div>

          <form className={styles.createForm} onSubmit={onCreateTable}>
            <Select value={entityType} onChange={(event) => {
              const next = event.target.value as EntityType;
              setEntityType(next);
              setTableCapacity(next === 'COMANDA' ? '1' : '4');
            }}>
              <option value="COMANDA">Comanda</option>
              <option value="MESA">Mesa</option>
            </Select>
            <Input placeholder="Numero" value={entityNumber} onChange={(event) => setEntityNumber(event.target.value)} />
            <Input type="number" min="1" placeholder="Capacidade" value={tableCapacity} onChange={(event) => setTableCapacity(event.target.value)} />
            <Button type="submit" variant="primary" disabled={saving === 'create'}>
              {saving === 'create' ? 'Criando...' : 'Nova mesa/comanda'}
            </Button>
          </form>

          <div className={styles.configTableWrap}>
            <table className={styles.configTable}>
              <thead>
                <tr>
                  <th>Numero</th>
                  <th>Tipo</th>
                  <th>Capacidade</th>
                  <th>Status</th>
                  <th>QR Code</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {configRows.map((table) => {
                  const openSession = table.sessions?.[0];
                  return (
                    <tr key={table.id}>
                      <td>{tableNumber(table)}</td>
                      <td><span className={styles.typeBadge}>{tableType(table) === 'COMANDA' ? 'Comanda' : 'Mesa'}</span></td>
                      <td>{table.capacity || 1}</td>
                      <td>
                        <div className={styles.statusCell}>
                          <Badge tone={statusTone[table.status]}>{statusLabel[table.status]}</Badge>
                          <button
                            type="button"
                            className={`${styles.switch} ${table.status !== 'BLOCKED' ? styles.switchOn : ''}`}
                            disabled={Boolean(openSession) || saving === `status-${table.id}`}
                            onClick={() => void onToggleActive(table)}
                            aria-label={table.status === 'BLOCKED' ? 'Ativar' : 'Desativar'}
                          >
                            <span />
                          </button>
                        </div>
                      </td>
                      <td>
                        <Button onClick={() => setNotice(`QR Code local de ${table.name}: ${table.qrCode ?? 'nao configurado'}`)}>
                          Visualizar
                        </Button>
                      </td>
                      <td>
                        <Button variant="danger" disabled={Boolean(openSession) || table.status === 'BLOCKED'} onClick={() => void onUpdateStatus(table.id, 'BLOCKED')}>
                          Excluir
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {configRows.length === 0 ? <EmptyState title="Nenhum registro encontrado" description="Crie uma mesa/comanda ou ajuste a busca." /> : null}
          </div>
        </Card>
      ) : null}
    </main>
  );
}

function CommandsPanel({
  commands,
  selectedCommands,
  saving,
  summaryTotal,
  onMergeSelected,
  onSplit,
  toggleCommand,
}: {
  commands: OpenCommand[];
  selectedCommands: string[];
  saving: string | null;
  summaryTotal: number;
  onMergeSelected: () => Promise<void>;
  onSplit: (commandId: string, byGuests: boolean) => Promise<void>;
  toggleCommand: (commandId: string) => void;
}) {
  return (
    <Card className={styles.commandsPanel}>
      <div className={styles.panelHeader}>
        <div>
          <small>Comandas abertas</small>
          <h2>Contas em andamento</h2>
        </div>
        <div className={styles.actionsInline}>
          <Badge>{commands.length} abertas</Badge>
          <Badge>{currency(summaryTotal)}</Badge>
          <Button onClick={() => void onMergeSelected()} disabled={selectedCommands.length < 2 || saving === 'merge'}>
            Juntar selecionadas
          </Button>
        </div>
      </div>
      {commands.length === 0 ? <EmptyState title="Sem comandas abertas" description="Abra uma mesa ou comanda para iniciar consumo local." /> : null}
      <div className={styles.commandsList}>
        {commands.map((command) => (
          <article key={command.id} className={styles.commandRow}>
            <label className={styles.checkCell}>
              <input type="checkbox" checked={selectedCommands.includes(command.id)} onChange={() => toggleCommand(command.id)} />
            </label>
            <div>
              <strong>{command.code}</strong>
              <p>{command.tableRestaurant?.name ?? '-'}</p>
            </div>
            <div>
              <span>{command.guestCount} pessoa(s)</span>
              <p>{formatElapsed(minutesSince(command.openedAt))} aberta</p>
            </div>
            <div>
              <span>{command.orders?.length ?? 0} pedido(s)</span>
              <p>{currency(commandTotal(command))}</p>
            </div>
            <div className={styles.actionsInline}>
              <Button onClick={() => void onSplit(command.id, true)} disabled={saving === `split-${command.id}`}>
                Por pessoa
              </Button>
              <Button onClick={() => void onSplit(command.id, false)} disabled={saving === `split-${command.id}`}>
                Igual
              </Button>
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}
