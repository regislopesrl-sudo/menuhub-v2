import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import {
  createAdminMenuAddonOption,
  deleteAdminMenuAddonOption,
  fetchAdminMenuAddonGroups,
  updateAdminMenuAddonOption,
  type MenuAddonGroup,
  type MenuAddonOption,
} from '@/features/menu/menu.api';
import styles from '../page.module.css';

type OptionRow = MenuAddonOption & {
  groupId: string;
  groupName: string;
  usageGroups: string[];
  usageCount: number;
};

function money(value: number | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));
}

function buildRows(groups: MenuAddonGroup[]): OptionRow[] {
  const byName = new Map<string, OptionRow[]>();
  groups.forEach((group) => {
    group.options.forEach((option) => {
      const key = option.name.trim().toLowerCase();
      const current = byName.get(key) ?? [];
      current.push({
        ...option,
        groupId: group.id,
        groupName: group.name,
        usageGroups: [group.name],
        usageCount: 1,
      });
      byName.set(key, current);
    });
  });

  return Array.from(byName.values())
    .flatMap((items) => {
      const usageGroups = Array.from(new Set(items.map((item) => item.groupName)));
      return items.map((item) => ({
        ...item,
        usageGroups,
        usageCount: items.length,
      }));
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.groupName.localeCompare(b.groupName));
}

export function AddonOptionsPanel({
  companyId,
  branchId,
  onError,
  onNotice,
}: {
  companyId: string;
  branchId?: string;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [groups, setGroups] = useState<MenuAddonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [savingAction, setSavingAction] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newGroupId, setNewGroupId] = useState('');
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('0');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPrice, setEditingPrice] = useState('0');

  const load = async () => {
    setLoading(true);
    try {
      const payload = await fetchAdminMenuAddonGroups({ companyId, branchId });
      setGroups(payload);
      setNewGroupId((current) => current || payload[0]?.id || '');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao carregar opcoes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [branchId, companyId]);

  const rows = useMemo(() => buildRows(groups), [groups]);
  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => {
      const usageText = row.usageGroups.join(' ').toLowerCase();
      return row.name.toLowerCase().includes(term) || row.groupName.toLowerCase().includes(term) || usageText.includes(term);
    });
  }, [query, rows]);

  const activeOptions = rows.filter((row) => row.available !== false).length;
  const unusedOptions = rows.filter((row) => row.usageCount === 0).length;
  const duplicatedOptions = rows.filter((row) => row.usageCount > 1).length;

  const syncOption = (groupId: string, option: MenuAddonOption) => {
    setGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        const exists = group.options.some((item) => item.id === option.id);
        return {
          ...group,
          options: exists
            ? group.options.map((item) => (item.id === option.id ? option : item))
            : [...group.options, option],
        };
      }),
    );
  };

  const removeOption = (groupId: string, optionId: string) => {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? { ...group, options: group.options.filter((option) => option.id !== optionId) }
          : group,
      ),
    );
  };

  const createOption = async () => {
    const name = newName.trim();
    if (!newGroupId) {
      onError('Crie ou selecione um complemento antes de cadastrar opcoes.');
      return;
    }
    if (!name) {
      onError('Informe o nome da opcao.');
      return;
    }
    const group = groups.find((item) => item.id === newGroupId);
    setSavingAction('create-option');
    try {
      const option = await createAdminMenuAddonOption({
        companyId,
        branchId,
        groupId: newGroupId,
        payload: { name, price: Number(newPrice || 0), available: true, sortOrder: (group?.options.length ?? 0) + 1 },
      });
      syncOption(newGroupId, option);
      setNewName('');
      setNewPrice('0');
      setCreating(false);
      onNotice('Opcao cadastrada.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao cadastrar opcao.');
    } finally {
      setSavingAction(null);
    }
  };

  const startEdit = (row: OptionRow) => {
    setEditingId(row.id);
    setEditingName(row.name);
    setEditingPrice(String(row.price ?? 0));
  };

  const saveEdit = async (row: OptionRow) => {
    const name = editingName.trim();
    if (!name) {
      onError('Informe o nome da opcao.');
      return;
    }
    setSavingAction(`option-${row.id}`);
    try {
      const option = await updateAdminMenuAddonOption({
        companyId,
        branchId,
        optionId: row.id,
        payload: { name, price: Number(editingPrice || 0), available: row.available !== false },
      });
      syncOption(row.groupId, option);
      setEditingId(null);
      onNotice('Opcao atualizada.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao atualizar opcao.');
    } finally {
      setSavingAction(null);
    }
  };

  const toggleOption = async (row: OptionRow) => {
    setSavingAction(`option-${row.id}`);
    try {
      const option = await updateAdminMenuAddonOption({
        companyId,
        branchId,
        optionId: row.id,
        payload: { available: row.available === false },
      });
      syncOption(row.groupId, option);
      onNotice(option.available ? 'Opcao ativada.' : 'Opcao desativada.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao alterar status da opcao.');
    } finally {
      setSavingAction(null);
    }
  };

  const deleteOption = async (row: OptionRow) => {
    if (!window.confirm(`Excluir a opcao "${row.name}" do complemento "${row.groupName}"?`)) return;
    setSavingAction(`option-${row.id}`);
    try {
      await deleteAdminMenuAddonOption({ companyId, branchId, optionId: row.id });
      removeOption(row.groupId, row.id);
      onNotice('Opcao removida.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao remover opcao.');
    } finally {
      setSavingAction(null);
    }
  };

  return (
    <section className={styles.optionsHub}>
      <Card className={styles.optionsHeaderPanel}>
        <div>
          <span>Opcoes</span>
          <strong>Banco unico de opcoes usadas nos complementos.</strong>
          <p>Veja onde cada opcao aparece, ajuste preco e status, ou cadastre novas opcoes dentro de um complemento.</p>
        </div>
        <div className={styles.optionsHeaderActions}>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquise por uma opcao" />
          <Button variant="primary" onClick={() => setCreating((current) => !current)}>Nova opcao</Button>
        </div>
      </Card>

      <section className={styles.addonMetricRow}>
        <Card className={styles.metric}><span>Opcoes</span><strong>{rows.length}</strong></Card>
        <Card className={styles.metric}><span>Ativas</span><strong>{activeOptions}</strong></Card>
        <Card className={styles.metric}><span>Reutilizadas</span><strong>{duplicatedOptions}</strong></Card>
        <Card className={styles.metric}><span>Sem uso</span><strong>{unusedOptions}</strong></Card>
      </section>

      {creating ? (
        <Card className={styles.optionCreatePanel}>
          <div>
            <strong>Nova opcao</strong>
            <span>A opcao precisa nascer dentro de um complemento.</span>
          </div>
          <Select value={newGroupId} onChange={(event) => setNewGroupId(event.target.value)}>
            <option value="">Selecione o complemento</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </Select>
          <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nome da opcao" />
          <Input value={newPrice} onChange={(event) => setNewPrice(event.target.value)} placeholder="Preco" inputMode="decimal" />
          <Button onClick={() => void createOption()} disabled={savingAction === 'create-option'}>Salvar opcao</Button>
        </Card>
      ) : null}

      {loading ? <LoadingState label="Carregando opcoes..." /> : null}

      {!loading && filteredRows.length === 0 ? (
        <EmptyState title="Nenhuma opcao encontrada" description="Cadastre opcoes nos complementos ou ajuste a busca." />
      ) : null}

      {!loading && filteredRows.length > 0 ? (
        <Card className={styles.optionsTablePanel}>
          <div className={styles.optionsTableHeader}>
            <div>
              <span>Opcoes cadastradas</span>
              <strong>{filteredRows.length} registro(s)</strong>
            </div>
            <Button onClick={() => void load()}>Atualizar</Button>
          </div>
          <div className={styles.optionsList}>
            {filteredRows.map((row) => {
              const editing = editingId === row.id;
              return (
                <article key={`${row.groupId}-${row.id}`} className={styles.optionListRow}>
                  {editing ? (
                    <>
                      <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} />
                      <Input value={editingPrice} onChange={(event) => setEditingPrice(event.target.value)} inputMode="decimal" />
                      <Button onClick={() => void saveEdit(row)} disabled={savingAction === `option-${row.id}`}>Salvar</Button>
                      <Button onClick={() => setEditingId(null)}>Cancelar</Button>
                    </>
                  ) : (
                    <>
                      <div className={styles.optionPrimaryInfo}>
                        <strong>{row.name}</strong>
                        <span>
                          {row.usageCount > 0
                            ? `Usado ${row.usageCount} vez(es): ${row.usageGroups.join(', ')}`
                            : 'Nao usado em nenhum complemento'}
                        </span>
                      </div>
                      <div className={styles.catalogPriceBox}>
                        <span>Preco</span>
                        <strong>{money(row.price)}</strong>
                      </div>
                      <Badge tone={row.available === false ? 'danger' : 'success'}>{row.available === false ? 'Inativa' : 'Ativa'}</Badge>
                      <div className={styles.catalogRowActions}>
                        <Button onClick={() => startEdit(row)}>Editar</Button>
                        <Button onClick={() => void toggleOption(row)} disabled={savingAction === `option-${row.id}`}>
                          {row.available === false ? 'Ativar' : 'Desativar'}
                        </Button>
                        <Button variant="danger" onClick={() => void deleteOption(row)} disabled={savingAction === `option-${row.id}`}>
                          Excluir
                        </Button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </Card>
      ) : null}
    </section>
  );
}
