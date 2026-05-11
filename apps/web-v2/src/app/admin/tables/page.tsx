'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  createTable,
  listOpenCommands,
  listTables,
  openTableSession,
  closeTableSession,
  transferTableSession,
  splitCommand,
  mergeCommands,
  type OpenCommand,
  type TableItem,
} from '@/features/tables/tables.api';
import styles from './page.module.css';

export default function AdminTablesPage() {
  const [tables, setTables] = useState<TableItem[]>([]);
  const [commands, setCommands] = useState<OpenCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [tableName, setTableName] = useState('');
  const [tableCapacity, setTableCapacity] = useState('4');
  const [guestCount, setGuestCount] = useState('2');
  const [transferTo, setTransferTo] = useState('');

  const openSessions = useMemo(
    () => tables.filter((table) => table.sessions?.[0]).map((table) => ({ table, session: table.sessions![0] })),
    [tables],
  );

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

  async function onCreateTable(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createTable({ name: tableName, capacity: Number(tableCapacity || '1') });
      setTableName('');
      setTableCapacity('4');
      setNotice('Mesa criada com sucesso.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar mesa.');
    } finally {
      setSaving(false);
    }
  }

  async function onOpenSession(tableId: string) {
    setSaving(true);
    setError(null);
    try {
      await openTableSession(tableId, { guestCount: Number(guestCount || '1') });
      setNotice('Comanda aberta.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao abrir comanda.');
    } finally {
      setSaving(false);
    }
  }

  async function onCloseSession(sessionId: string) {
    setSaving(true);
    setError(null);
    try {
      await closeTableSession(sessionId);
      setNotice('Comanda fechada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao fechar comanda.');
    } finally {
      setSaving(false);
    }
  }

  async function onTransfer(sessionId: string) {
    if (!transferTo) {
      setError('Informe a mesa destino para transferencia.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await transferTableSession(sessionId, transferTo);
      setNotice('Mesa transferida com sucesso.');
      setTransferTo('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao transferir mesa.');
    } finally {
      setSaving(false);
    }
  }

  async function onSplit(commandId: string, byGuests: boolean) {
    setSaving(true);
    setError(null);
    try {
      const result = await splitCommand(commandId, byGuests);
      setNotice(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao separar conta.');
    } finally {
      setSaving(false);
    }
  }

  async function onMerge(commandIds: string[]) {
    setSaving(true);
    setError(null);
    try {
      const result = await mergeCommands(commandIds);
      setNotice(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao juntar comandas.');
    } finally {
      setSaving(false);
    }
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
        subtitle="Gerencie abertura, transferencia, consumo local e fechamento de comanda."
      />

      {error ? <Card className={styles.error}>{error}</Card> : null}
      {notice ? <Card className={styles.notice}>{notice}</Card> : null}

      <Card className={styles.section}>
        <h2>Nova mesa</h2>
        <form className={styles.form} onSubmit={onCreateTable}>
          <Input placeholder="Nome da mesa (ex: M12)" value={tableName} onChange={(e) => setTableName(e.target.value)} />
          <Input placeholder="Capacidade" value={tableCapacity} onChange={(e) => setTableCapacity(e.target.value)} />
          <Button type="submit" disabled={saving}>Criar mesa</Button>
        </form>
      </Card>

      <section className={styles.grid}>
        {tables.length === 0 ? <EmptyState title="Sem mesas" description="Crie a primeira mesa para iniciar atendimento de salao." /> : null}
        {tables.map((table) => {
          const openSession = table.sessions?.[0];
          return (
            <Card key={table.id} className={styles.tableCard}>
              <div className={styles.row}>
                <h3>{table.name}</h3>
                <Badge>{table.status}</Badge>
              </div>
              <p>Capacidade: {table.capacity}</p>
              {openSession ? (
                <>
                  <p>Sessao aberta: {openSession.id.slice(0, 8)} · {openSession.guestCount} pessoas</p>
                  <div className={styles.actions}>
                    <Button onClick={() => void onCloseSession(openSession.id)} disabled={saving}>Fechar comanda</Button>
                  </div>
                  <div className={styles.transfer}>
                    <Input placeholder="Mesa destino" value={transferTo} onChange={(e) => setTransferTo(e.target.value)} />
                    <Button onClick={() => void onTransfer(openSession.id)} disabled={saving}>Transferir</Button>
                  </div>
                </>
              ) : (
                <div className={styles.actions}>
                  <Input placeholder="Pessoas" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />
                  <Button onClick={() => void onOpenSession(table.id)} disabled={saving}>Abrir comanda</Button>
                </div>
              )}
            </Card>
          );
        })}
      </section>

      <Card className={styles.section}>
        <h2>Comandas abertas</h2>
        {commands.length === 0 ? <EmptyState title="Sem comandas abertas" description="Abra uma sessao para iniciar consumo local." /> : null}
        <div className={styles.commandsList}>
          {commands.map((command) => (
            <article key={command.id} className={styles.commandRow}>
              <div>
                <strong>{command.code}</strong>
                <p>Mesa: {command.tableRestaurant?.name ?? '-'}</p>
                <p>Pedidos: {command.orders?.length ?? 0}</p>
              </div>
              <div className={styles.actions}>
                <Button onClick={() => void onSplit(command.id, true)} disabled={saving}>Separar por pessoa</Button>
                <Button onClick={() => void onSplit(command.id, false)} disabled={saving}>Separar igual</Button>
              </div>
            </article>
          ))}
        </div>
        {commands.length >= 2 ? (
          <div className={styles.actions}>
            <Button onClick={() => void onMerge(commands.slice(0, 2).map((item) => item.id))} disabled={saving}>Juntar 2 primeiras comandas (mock)</Button>
          </div>
        ) : null}
      </Card>
    </main>
  );
}

