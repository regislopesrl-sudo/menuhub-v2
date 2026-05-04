import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import {
  createAdminMenuAddonGroup,
  createAdminMenuAddonOption,
  deleteAdminMenuAddonGroup,
  deleteAdminMenuAddonOption,
  fetchAdminMenuProductAddonGroups,
  updateAdminMenuAddonGroup,
  updateAdminMenuAddonOption,
  type AdminMenuAddonGroupPayload,
  type AdminMenuAddonOptionPayload,
  type MenuAddonGroup,
  type MenuAddonOption,
} from '@/features/menu/menu.api';
import type { MenuProduct } from '@/features/menu/menu.mock';
import { brl } from '../menu-view-model';
import styles from '../page.module.css';

export function AddonGroupsPanel({
  product,
  companyId,
  branchId,
  onProductChanged,
  onError,
  onNotice,
}: {
  product?: MenuProduct;
  companyId: string;
  branchId?: string;
  onProductChanged: (product: MenuProduct) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [groups, setGroups] = useState<MenuAddonGroup[]>(product?.addonGroups ?? []);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState<Required<AdminMenuAddonGroupPayload>>({
    name: '',
    minSelect: 0,
    maxSelect: 1,
    required: false,
    allowMultiple: false,
  });

  const publishGroups = (nextGroups: MenuAddonGroup[]) => {
    setGroups(nextGroups);
    if (product) {
      onProductChanged({ ...product, addonGroups: nextGroups });
    }
  };

  useEffect(() => {
    setGroups(product?.addonGroups ?? []);
  }, [product]);

  useEffect(() => {
    if (!product?.id) return;
    let mounted = true;
    setLoading(true);
    fetchAdminMenuProductAddonGroups({ companyId, branchId, productId: product.id })
      .then((nextGroups) => {
        if (!mounted) return;
        publishGroups(Array.isArray(nextGroups) ? nextGroups : []);
      })
      .catch((err) => {
        if (!mounted) return;
        onError(err instanceof Error ? err.message : 'Falha ao carregar adicionais.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [branchId, companyId, product?.id]);

  if (!product) {
    return <EmptyState title="Produto nao selecionado" description="Abra um produto para gerenciar adicionais." />;
  }

  const createGroup = async () => {
    setAction('create-group');
    try {
      const created = await createAdminMenuAddonGroup({
        companyId,
        branchId,
        productId: product.id,
        payload: newGroup,
      });
      publishGroups([...groups, created]);
      setNewGroup({ name: '', minSelect: 0, maxSelect: 1, required: false, allowMultiple: false });
      onNotice('Grupo de adicionais criado.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao criar grupo de adicionais.');
    } finally {
      setAction(null);
    }
  };

  const updateGroup = async (groupId: string, payload: AdminMenuAddonGroupPayload) => {
    setAction(`group-${groupId}`);
    try {
      const updated = await updateAdminMenuAddonGroup({ companyId, branchId, groupId, payload });
      publishGroups(groups.map((group) => (group.id === groupId ? updated : group)));
      onNotice('Grupo de adicionais atualizado.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao atualizar grupo de adicionais.');
    } finally {
      setAction(null);
    }
  };

  const deleteGroup = async (groupId: string) => {
    if (!window.confirm('Remover este grupo e todas as opcoes dele?')) return;
    setAction(`delete-group-${groupId}`);
    try {
      await deleteAdminMenuAddonGroup({ companyId, branchId, groupId });
      publishGroups(groups.filter((group) => group.id !== groupId));
      onNotice('Grupo de adicionais removido.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao remover grupo de adicionais.');
    } finally {
      setAction(null);
    }
  };

  const createOption = async (groupId: string, payload: AdminMenuAddonOptionPayload) => {
    setAction(`create-option-${groupId}`);
    try {
      const created = await createAdminMenuAddonOption({ companyId, branchId, groupId, payload });
      publishGroups(groups.map((group) =>
        group.id === groupId ? { ...group, options: [...(group.options ?? []), created] } : group,
      ));
      onNotice('Opcao de adicional criada.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao criar opcao de adicional.');
    } finally {
      setAction(null);
    }
  };

  const updateOption = async (groupId: string, optionId: string, payload: AdminMenuAddonOptionPayload) => {
    setAction(`option-${optionId}`);
    try {
      const updated = await updateAdminMenuAddonOption({ companyId, branchId, optionId, payload });
      publishGroups(groups.map((group) =>
        group.id === groupId
          ? { ...group, options: (group.options ?? []).map((option) => (option.id === optionId ? updated : option)) }
          : group,
      ));
      onNotice('Opcao de adicional atualizada.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao atualizar opcao de adicional.');
    } finally {
      setAction(null);
    }
  };

  const deleteOption = async (groupId: string, optionId: string) => {
    if (!window.confirm('Remover esta opcao de adicional?')) return;
    setAction(`delete-option-${optionId}`);
    try {
      await deleteAdminMenuAddonOption({ companyId, branchId, optionId });
      publishGroups(groups.map((group) =>
        group.id === groupId
          ? { ...group, options: (group.options ?? []).filter((option) => option.id !== optionId) }
          : group,
      ));
      onNotice('Opcao de adicional removida.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao remover opcao de adicional.');
    } finally {
      setAction(null);
    }
  };

  return (
    <div className={styles.addonEditor}>
      {loading ? <LoadingState label="Carregando adicionais..." /> : null}

      <section className={styles.addonCreator}>
        <div>
          <strong>Novo grupo</strong>
          <span>Configure obrigatoriedade, minimo, maximo e multipla escolha.</span>
        </div>
        <div className={styles.addonForm}>
          <Input value={newGroup.name} onChange={(event) => setNewGroup((prev) => ({ ...prev, name: event.target.value }))} placeholder="Ex: Adicionais" />
          <Input value={String(newGroup.minSelect)} onChange={(event) => setNewGroup((prev) => ({ ...prev, minSelect: Number(event.target.value || '0') }))} inputMode="numeric" placeholder="Min" />
          <Input value={String(newGroup.maxSelect)} onChange={(event) => setNewGroup((prev) => ({ ...prev, maxSelect: Number(event.target.value || '0') }))} inputMode="numeric" placeholder="Max" />
          <label className={styles.toggleCompact}>
            <input type="checkbox" checked={newGroup.required} onChange={(event) => setNewGroup((prev) => ({ ...prev, required: event.target.checked }))} />
            Obrigatorio
          </label>
          <label className={styles.toggleCompact}>
            <input type="checkbox" checked={newGroup.allowMultiple} onChange={(event) => setNewGroup((prev) => ({ ...prev, allowMultiple: event.target.checked }))} />
            Multipla
          </label>
          <Button variant="primary" onClick={() => void createGroup()} disabled={action === 'create-group'}>
            {action === 'create-group' ? 'Criando...' : 'Criar grupo'}
          </Button>
        </div>
      </section>

      {groups.length === 0 && !loading ? (
        <EmptyState title="Sem adicionais" description="Crie o primeiro grupo de opcionais para este produto." />
      ) : null}

      <div className={styles.addonList}>
        {groups.map((group) => (
          <AddonGroupEditor
            key={group.id}
            group={group}
            action={action}
            onSaveGroup={(payload) => void updateGroup(group.id, payload)}
            onDeleteGroup={() => void deleteGroup(group.id)}
            onCreateOption={(payload) => void createOption(group.id, payload)}
            onSaveOption={(optionId, payload) => void updateOption(group.id, optionId, payload)}
            onDeleteOption={(optionId) => void deleteOption(group.id, optionId)}
          />
        ))}
      </div>
    </div>
  );
}

function AddonGroupEditor({
  group,
  action,
  onSaveGroup,
  onDeleteGroup,
  onCreateOption,
  onSaveOption,
  onDeleteOption,
}: {
  group: MenuAddonGroup;
  action: string | null;
  onSaveGroup: (payload: AdminMenuAddonGroupPayload) => void;
  onDeleteGroup: () => void;
  onCreateOption: (payload: AdminMenuAddonOptionPayload) => void;
  onSaveOption: (optionId: string, payload: AdminMenuAddonOptionPayload) => void;
  onDeleteOption: (optionId: string) => void;
}) {
  const [name, setName] = useState(group.name);
  const [minSelect, setMinSelect] = useState(String(group.minSelect ?? 0));
  const [maxSelect, setMaxSelect] = useState(String(group.maxSelect ?? 1));
  const [required, setRequired] = useState(group.required);
  const [allowMultiple, setAllowMultiple] = useState(group.allowMultiple);
  const [newOption, setNewOption] = useState({ name: '', price: '0' });

  useEffect(() => {
    setName(group.name);
    setMinSelect(String(group.minSelect ?? 0));
    setMaxSelect(String(group.maxSelect ?? 1));
    setRequired(group.required);
    setAllowMultiple(group.allowMultiple);
  }, [group]);

  const createOption = () => {
    onCreateOption({ name: newOption.name, price: Number(newOption.price || '0'), available: true });
    setNewOption({ name: '', price: '0' });
  };

  return (
    <section className={styles.addonGroup}>
      <div className={styles.addonHeader}>
        <div>
          <strong>{group.name}</strong>
          <span>{group.required ? 'Obrigatorio' : 'Opcional'} | Min {group.minSelect} | Max {group.maxSelect}</span>
        </div>
        <Badge tone={group.allowMultiple ? 'success' : 'warning'}>
          {group.allowMultiple ? 'Multipla escolha' : 'Escolha unica'}
        </Badge>
      </div>

      <div className={styles.groupEditGrid}>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do grupo" />
        <Input value={minSelect} onChange={(event) => setMinSelect(event.target.value)} inputMode="numeric" placeholder="Min" />
        <Input value={maxSelect} onChange={(event) => setMaxSelect(event.target.value)} inputMode="numeric" placeholder="Max" />
        <label className={styles.toggleCompact}>
          <input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} />
          Obrigatorio
        </label>
        <label className={styles.toggleCompact}>
          <input type="checkbox" checked={allowMultiple} onChange={(event) => setAllowMultiple(event.target.checked)} />
          Multipla
        </label>
        <Button variant="primary" onClick={() => onSaveGroup({ name, minSelect: Number(minSelect || '0'), maxSelect: Number(maxSelect || '0'), required, allowMultiple })} disabled={action === `group-${group.id}`}>
          {action === `group-${group.id}` ? 'Salvando...' : 'Salvar grupo'}
        </Button>
        <Button onClick={onDeleteGroup} disabled={action === `delete-group-${group.id}`}>Remover</Button>
      </div>

      <div className={styles.optionCreateRow}>
        <Input value={newOption.name} onChange={(event) => setNewOption((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nova opcao" />
        <Input value={newOption.price} onChange={(event) => setNewOption((prev) => ({ ...prev, price: event.target.value }))} inputMode="decimal" placeholder="Preco" />
        <Button onClick={createOption} disabled={action === `create-option-${group.id}`}>
          {action === `create-option-${group.id}` ? 'Criando...' : 'Adicionar opcao'}
        </Button>
      </div>

      <div className={styles.optionList}>
        {(group.options ?? []).map((option) => (
          <AddonOptionEditor key={option.id} option={option} action={action} onSave={(payload) => onSaveOption(option.id, payload)} onDelete={() => onDeleteOption(option.id)} />
        ))}
      </div>
    </section>
  );
}

function AddonOptionEditor({
  option,
  action,
  onSave,
  onDelete,
}: {
  option: MenuAddonOption;
  action: string | null;
  onSave: (payload: AdminMenuAddonOptionPayload) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(option.name);
  const [price, setPrice] = useState(String(option.price ?? 0));
  const [available, setAvailable] = useState(option.available !== false);

  useEffect(() => {
    setName(option.name);
    setPrice(String(option.price ?? 0));
    setAvailable(option.available !== false);
  }, [option]);

  return (
    <div className={styles.optionRow}>
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Opcao" />
      <Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" placeholder="Preco" />
      <label className={styles.toggleCompact}>
        <input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} />
        Ativo
      </label>
      <strong>{brl(Number(price || '0'))}</strong>
      <Badge tone={available ? 'success' : 'danger'}>{available ? 'Ativo' : 'Inativo'}</Badge>
      <Button variant="primary" onClick={() => onSave({ name, price: Number(price || '0'), available })} disabled={action === `option-${option.id}`}>
        {action === `option-${option.id}` ? 'Salvando...' : 'Salvar'}
      </Button>
      <Button onClick={onDelete} disabled={action === `delete-option-${option.id}`}>Remover</Button>
    </div>
  );
}
