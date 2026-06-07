import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import {
  createAdminMenuAddonGroup,
  createAdminMenuAddonOption,
  deleteAdminMenuAddonGroup,
  deleteAdminMenuAddonOption,
  fetchAdminMenuAddonGroups,
  updateAdminMenuAddonGroup,
  updateAdminMenuAddonGroupProducts,
  updateAdminMenuAddonOption,
  type MenuAddonGroup,
  type MenuAddonOption,
} from '@/features/menu/menu.api';
import type { MenuProduct } from '@/features/menu/menu.mock';
import styles from '../page.module.css';

type AddonCategoryRow = {
  key: string;
  label: string;
  count: number;
};

type GroupDraft = {
  name: string;
  minSelect: string;
  maxSelect: string;
  required: boolean;
  allowMultiple: boolean;
};

const emptyGroupDraft: GroupDraft = {
  name: '',
  minSelect: '0',
  maxSelect: '1',
  required: false,
  allowMultiple: false,
};

function money(value: number | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));
}

function groupRuleLabel(group: Pick<MenuAddonGroup, 'allowMultiple' | 'required' | 'minSelect' | 'maxSelect'>) {
  const base = group.allowMultiple ? 'Mais de uma opcao' : 'Apenas uma das opcoes';
  const required = group.required ? 'obrigatoria' : 'opcional';
  return `${base} (${required}, min. ${group.minSelect}, max. ${group.maxSelect})`;
}

function draftFromGroup(group: MenuAddonGroup): GroupDraft {
  return {
    name: group.name,
    minSelect: String(group.minSelect ?? 0),
    maxSelect: String(group.maxSelect ?? 1),
    required: group.required === true,
    allowMultiple: group.allowMultiple === true,
  };
}

export function AddonsManagementPanel({
  companyId,
  branchId,
  products,
  onProductsChanged,
  onError,
  onNotice,
}: {
  companyId: string;
  branchId?: string;
  products: MenuProduct[];
  onProductsChanged: (products: MenuProduct[]) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [groups, setGroups] = useState<MenuAddonGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingAction, setSavingAction] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<GroupDraft>(emptyGroupDraft);
  const [creating, setCreating] = useState(false);
  const [optionName, setOptionName] = useState('');
  const [optionPrice, setOptionPrice] = useState('0');
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editingOptionName, setEditingOptionName] = useState('');
  const [editingOptionPrice, setEditingOptionPrice] = useState('0');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchAdminMenuAddonGroups({ companyId, branchId })
      .then((payload) => {
        if (!mounted) return;
        setGroups(payload);
      })
      .catch((err) => {
        if (!mounted) return;
        onError(err instanceof Error ? err.message : 'Falha ao carregar complementos.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [branchId, companyId, onError]);

  const groupsWithFallbackLinks = useMemo(() => {
    return groups.map((group) => {
      const fallbackIds = products
        .filter((product) => (product.addonGroups ?? []).some((productGroup) => productGroup.id === group.id))
        .map((product) => product.id);
      const linkedProductIds = group.linkedProductIds?.length ? group.linkedProductIds : fallbackIds;
      return {
        ...group,
        linkedProductIds,
        productCount: linkedProductIds.length,
      };
    });
  }, [groups, products]);

  const filteredGroups = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return groupsWithFallbackLinks;
    return groupsWithFallbackLinks.filter((group) => {
      const optionText = group.options.map((option) => option.name).join(' ').toLowerCase();
      return group.name.toLowerCase().includes(term) || optionText.includes(term);
    });
  }, [groupsWithFallbackLinks, query]);

  useEffect(() => {
    if (groupsWithFallbackLinks.length === 0) {
      if (selectedGroupId) setSelectedGroupId(null);
      return;
    }

    if (!selectedGroupId || !groupsWithFallbackLinks.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(groupsWithFallbackLinks[0].id);
    }
  }, [groupsWithFallbackLinks, selectedGroupId]);

  const selectedGroup = groupsWithFallbackLinks.find((group) => group.id === selectedGroupId) ?? null;
  const linkedSet = useMemo(() => new Set(selectedGroup?.linkedProductIds ?? []), [selectedGroup]);
  const productsWithAddons = products.filter((product) => (product.addonGroups ?? []).length > 0).length;
  const requiredGroups = groupsWithFallbackLinks.filter((group) => group.required).length;
  const totalOptions = groupsWithFallbackLinks.reduce((total, group) => total + group.options.length, 0);

  useEffect(() => {
    if (creating) return;
    if (selectedGroup) {
      setDraft(draftFromGroup(selectedGroup));
      return;
    }
    setDraft(emptyGroupDraft);
  }, [creating, selectedGroup]);

  const categories = useMemo<AddonCategoryRow[]>(() => {
    const map = new Map<string, AddonCategoryRow>();
    products.forEach((product) => {
      const key = product.categoryName || 'Sem categoria';
      const current = map.get(key);
      map.set(key, { key, label: key, count: (current?.count ?? 0) + 1 });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);

  const activeCategory = selectedCategory || categories[0]?.key || '';

  const visibleProducts = useMemo(() => {
    if (!activeCategory) return [];
    return products.filter((product) => (product.categoryName || 'Sem categoria') === activeCategory);
  }, [products, activeCategory]);

  useEffect(() => {
    if (categories.length === 0) {
      if (selectedCategory) setSelectedCategory('');
      return;
    }

    if (!categories.some((item) => item.key === selectedCategory)) {
      setSelectedCategory(categories[0].key);
    }
  }, [categories, selectedCategory]);

  if (products.length === 0) {
    return <EmptyState title="Nenhum produto cadastrado" description="Cadastre um produto antes de configurar complementos." />;
  }

  const applyUpdatedGroup = (updated: MenuAddonGroup) => {
    setGroups((current) => current.map((group) => (group.id === updated.id ? updated : group)));
    const updatedLinked = new Set(updated.linkedProductIds ?? []);
    onProductsChanged(
      products.map((product) => {
        const currentGroups = product.addonGroups ?? [];
        const hasGroup = currentGroups.some((group) => group.id === updated.id);
        if (updatedLinked.has(product.id)) {
          return {
            ...product,
            addonGroups: hasGroup
              ? currentGroups.map((group) => (group.id === updated.id ? updated : group))
              : [...currentGroups, updated],
          };
        }
        return {
          ...product,
          addonGroups: currentGroups.filter((group) => group.id !== updated.id),
        };
      }),
    );
  };

  const syncOptionInSelectedGroup = (option: MenuAddonOption) => {
    if (!selectedGroup) return;
    const exists = selectedGroup.options.some((item) => item.id === option.id);
    const nextGroup = {
      ...selectedGroup,
      options: exists
        ? selectedGroup.options.map((item) => (item.id === option.id ? option : item))
        : [...selectedGroup.options, option],
    };
    setGroups((current) => current.map((group) => (group.id === nextGroup.id ? nextGroup : group)));
  };

  const removeOptionFromSelectedGroup = (optionId: string) => {
    if (!selectedGroup) return;
    const nextGroup = {
      ...selectedGroup,
      options: selectedGroup.options.filter((item) => item.id !== optionId),
    };
    setGroups((current) => current.map((group) => (group.id === nextGroup.id ? nextGroup : group)));
  };

  const updateProductLinks = async (productId: string, checked: boolean) => {
    if (!selectedGroup) return;
    const currentIds = new Set(selectedGroup.linkedProductIds ?? []);
    if (checked) {
      currentIds.add(productId);
    } else {
      currentIds.delete(productId);
    }

    setSavingAction(`product-${productId}`);
    try {
      const updated = await updateAdminMenuAddonGroupProducts({
        companyId,
        branchId,
        groupId: selectedGroup.id,
        productIds: Array.from(currentIds),
      });
      applyUpdatedGroup(updated);
      onNotice(checked ? 'Produto vinculado ao complemento.' : 'Produto removido do complemento.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao atualizar produtos do complemento.');
    } finally {
      setSavingAction(null);
    }
  };

  const updateCategoryLinks = async (checked: boolean) => {
    if (!selectedGroup || visibleProducts.length === 0) return;
    const currentIds = new Set(selectedGroup.linkedProductIds ?? []);
    visibleProducts.forEach((product) => {
      if (checked) {
        currentIds.add(product.id);
      } else {
        currentIds.delete(product.id);
      }
    });

    setSavingAction('bulk-category');
    try {
      const updated = await updateAdminMenuAddonGroupProducts({
        companyId,
        branchId,
        groupId: selectedGroup.id,
        productIds: Array.from(currentIds),
      });
      applyUpdatedGroup(updated);
      onNotice(checked ? 'Categoria vinculada ao complemento.' : 'Categoria removida do complemento.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao atualizar categoria do complemento.');
    } finally {
      setSavingAction(null);
    }
  };

  const startNewGroup = () => {
    setCreating(true);
    setSelectedGroupId(null);
    setDraft(emptyGroupDraft);
    setOptionName('');
    setOptionPrice('0');
  };

  const selectGroup = (group: MenuAddonGroup) => {
    setCreating(false);
    setSelectedGroupId(group.id);
    setEditingOptionId(null);
  };

  const saveGroup = async () => {
    const name = draft.name.trim();
    const minSelect = Number(draft.minSelect || 0);
    const maxSelect = Number(draft.maxSelect || 0);
    if (!name) {
      onError('Informe o nome do complemento.');
      return;
    }
    if (!Number.isInteger(minSelect) || !Number.isInteger(maxSelect) || minSelect < 0 || maxSelect < 0) {
      onError('Minimo e maximo devem ser numeros inteiros maiores ou iguais a zero.');
      return;
    }
    if (minSelect > maxSelect) {
      onError('Minimo nao pode ser maior que o maximo.');
      return;
    }
    if (!draft.allowMultiple && maxSelect > 1) {
      onError('Para permitir mais de uma escolha, ative multipla escolha.');
      return;
    }
    if (draft.required && maxSelect === 0) {
      onError('Complemento obrigatorio deve permitir ao menos uma opcao.');
      return;
    }

    const payload = { name, minSelect, maxSelect, required: draft.required, allowMultiple: draft.allowMultiple };
    setSavingAction('save-group');
    try {
      if (creating) {
        const seedProductId = products[0]?.id;
        if (!seedProductId) {
          onError('Cadastre um produto antes de criar complemento.');
          return;
        }
        const created = await createAdminMenuAddonGroup({ companyId, branchId, productId: seedProductId, payload });
        const detached = await updateAdminMenuAddonGroupProducts({
          companyId,
          branchId,
          groupId: created.id,
          productIds: [],
        });
        setGroups((current) => [detached, ...current]);
        setSelectedGroupId(detached.id);
        setCreating(false);
        onNotice('Complemento criado. Agora vincule categorias ou produtos.');
      } else if (selectedGroup) {
        const updated = await updateAdminMenuAddonGroup({ companyId, branchId, groupId: selectedGroup.id, payload });
        applyUpdatedGroup(updated);
        onNotice('Complemento atualizado.');
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao salvar complemento.');
    } finally {
      setSavingAction(null);
    }
  };

  const removeGroup = async () => {
    if (!selectedGroup) return;
    if (!window.confirm(`Excluir o complemento "${selectedGroup.name}"? Ele sera removido dos produtos vinculados.`)) return;
    setSavingAction('delete-group');
    try {
      await deleteAdminMenuAddonGroup({ companyId, branchId, groupId: selectedGroup.id });
      setGroups((current) => current.filter((group) => group.id !== selectedGroup.id));
      onProductsChanged(
        products.map((product) => ({
          ...product,
          addonGroups: (product.addonGroups ?? []).filter((group) => group.id !== selectedGroup.id),
        })),
      );
      setSelectedGroupId(null);
      onNotice('Complemento removido.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao remover complemento.');
    } finally {
      setSavingAction(null);
    }
  };

  const addOption = async () => {
    if (!selectedGroup) return;
    const name = optionName.trim();
    if (!name) {
      onError('Informe o nome da opcao.');
      return;
    }
    setSavingAction('add-option');
    try {
      const option = await createAdminMenuAddonOption({
        companyId,
        branchId,
        groupId: selectedGroup.id,
        payload: { name, price: Number(optionPrice || 0), available: true, sortOrder: selectedGroup.options.length + 1 },
      });
      syncOptionInSelectedGroup(option);
      setOptionName('');
      setOptionPrice('0');
      onNotice('Opcao adicionada ao complemento.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao adicionar opcao.');
    } finally {
      setSavingAction(null);
    }
  };

  const startEditOption = (option: MenuAddonOption) => {
    setEditingOptionId(option.id);
    setEditingOptionName(option.name);
    setEditingOptionPrice(String(option.price ?? 0));
  };

  const saveOption = async (option: MenuAddonOption) => {
    const name = editingOptionName.trim();
    if (!name) {
      onError('Informe o nome da opcao.');
      return;
    }
    setSavingAction(`option-${option.id}`);
    try {
      const updated = await updateAdminMenuAddonOption({
        companyId,
        branchId,
        optionId: option.id,
        payload: { name, price: Number(editingOptionPrice || 0), available: option.available !== false },
      });
      syncOptionInSelectedGroup(updated);
      setEditingOptionId(null);
      onNotice('Opcao atualizada.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao atualizar opcao.');
    } finally {
      setSavingAction(null);
    }
  };

  const toggleOption = async (option: MenuAddonOption) => {
    setSavingAction(`option-${option.id}`);
    try {
      const updated = await updateAdminMenuAddonOption({
        companyId,
        branchId,
        optionId: option.id,
        payload: { available: option.available === false },
      });
      syncOptionInSelectedGroup(updated);
      onNotice(updated.available ? 'Opcao ativada.' : 'Opcao desativada.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao atualizar opcao.');
    } finally {
      setSavingAction(null);
    }
  };

  const removeOption = async (option: MenuAddonOption) => {
    if (!window.confirm(`Excluir a opcao "${option.name}"?`)) return;
    setSavingAction(`option-${option.id}`);
    try {
      await deleteAdminMenuAddonOption({ companyId, branchId, optionId: option.id });
      removeOptionFromSelectedGroup(option.id);
      onNotice('Opcao removida.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao remover opcao.');
    } finally {
      setSavingAction(null);
    }
  };

  return (
    <section className={styles.addonsHub}>
      <Card className={styles.addonsHeaderPanel}>
        <div>
          <span>Complementos</span>
          <strong>Grupos de adicionais e opcoes do cardapio.</strong>
          <p>Crie complementos, defina regras de escolha e aplique em categorias ou produtos.</p>
        </div>
        <div className={styles.addonsHeaderActions}>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquise por um complemento" />
          <Button variant="primary" onClick={startNewGroup}>Novo complemento</Button>
        </div>
      </Card>

      <section className={styles.addonMetricRow}>
        <Card className={styles.metric}><span>Complementos</span><strong>{groupsWithFallbackLinks.length}</strong></Card>
        <Card className={styles.metric}><span>Opcoes</span><strong>{totalOptions}</strong></Card>
        <Card className={styles.metric}><span>Obrigatorios</span><strong>{requiredGroups}</strong></Card>
        <Card className={styles.metric}><span>Produtos vinculados</span><strong>{productsWithAddons}</strong></Card>
      </section>

      {loading ? <LoadingState label="Carregando complementos..." /> : null}

      {!loading && groupsWithFallbackLinks.length === 0 ? (
        <EmptyState
          title="Nenhum complemento criado"
          description="Clique em Novo complemento para criar o primeiro grupo de adicionais."
        />
      ) : null}

      {groupsWithFallbackLinks.length > 0 || creating ? (
        <div className={styles.addonsWorkspace}>
          <Card className={styles.addonCatalogList}>
            <div className={styles.addonListHeader}>
              <strong>Complementos cadastrados</strong>
              <span>{filteredGroups.length} registro(s)</span>
            </div>
            <div className={styles.addonCardsList}>
              {filteredGroups.map((group) => {
                const selected = group.id === selectedGroup?.id && !creating;
                const preview = group.options.slice(0, 8).map((option) => option.name).join(', ');
                return (
                  <button
                    key={group.id}
                    type="button"
                    className={`${styles.addonCatalogCard} ${selected ? styles.addonCatalogCardActive : ''}`.trim()}
                    onClick={() => selectGroup(group)}
                  >
                    <div>
                      <strong>{group.name}</strong>
                      <span>{groupRuleLabel(group)}</span>
                    </div>
                    <p><b>Opcoes:</b> {preview || 'Sem opcoes cadastradas'}</p>
                    <div>
                      <Badge>{group.options.length} opcoes</Badge>
                      <Badge tone={group.productCount ? 'success' : 'warning'}>{group.productCount ?? 0} produtos</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className={styles.addonEditorPanel}>
            <div className={styles.addonConfigHeader}>
              <div>
                <span>{creating ? 'Novo complemento' : 'Complemento selecionado'}</span>
                <strong>{creating ? 'Criar complemento' : selectedGroup?.name ?? 'Selecione um complemento'}</strong>
                <p>{creating ? 'Cadastre a regra e depois adicione opcoes.' : selectedGroup ? groupRuleLabel(selectedGroup) : 'Clique em um item da lista.'}</p>
              </div>
              <div className={styles.addonConfigActions}>
                {!creating && selectedGroup ? <Badge tone={selectedGroup.productCount ? 'success' : 'warning'}>{selectedGroup.productCount ?? 0} vinculo(s)</Badge> : null}
                {!creating && selectedGroup ? <Button variant="danger" onClick={() => void removeGroup()} disabled={savingAction === 'delete-group'}>Excluir</Button> : null}
              </div>
            </div>

            {(creating || selectedGroup) ? (
              <>
                <div className={styles.addonDraftGrid}>
                  <label>
                    Nome do complemento
                    <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
                  </label>
                  <label>
                    Tipo de escolha
                    <Select
                      value={draft.allowMultiple ? 'multiple' : 'single'}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          allowMultiple: event.target.value === 'multiple',
                          maxSelect: event.target.value === 'multiple' ? current.maxSelect : '1',
                        }))
                      }
                    >
                      <option value="single">Apenas uma das opcoes</option>
                      <option value="multiple">Mais de uma opcao</option>
                    </Select>
                  </label>
                  <label>
                    Minimo
                    <Input value={draft.minSelect} onChange={(event) => setDraft((current) => ({ ...current, minSelect: event.target.value }))} inputMode="numeric" />
                  </label>
                  <label>
                    Maximo
                    <Input value={draft.maxSelect} onChange={(event) => setDraft((current) => ({ ...current, maxSelect: event.target.value }))} inputMode="numeric" />
                  </label>
                  <label className={styles.addonCheckRow}>
                    <input
                      type="checkbox"
                      checked={draft.required}
                      onChange={(event) => setDraft((current) => ({ ...current, required: event.target.checked }))}
                    />
                    Obrigatorio no pedido
                  </label>
                  <Button variant="primary" onClick={() => void saveGroup()} disabled={savingAction === 'save-group'}>
                    {savingAction === 'save-group' ? 'Salvando...' : creating ? 'Criar complemento' : 'Salvar complemento'}
                  </Button>
                </div>

                {!creating && selectedGroup ? (
                  <>
                    <div className={styles.addonOptionsEditor}>
                      <div className={styles.addonListHeader}>
                        <strong>Opcoes do complemento</strong>
                        <span>{selectedGroup.options.length} opcao(oes)</span>
                      </div>
                      <div className={styles.addonOptionCreateRow}>
                        <Input value={optionName} onChange={(event) => setOptionName(event.target.value)} placeholder="Nome da opcao" />
                        <Input value={optionPrice} onChange={(event) => setOptionPrice(event.target.value)} placeholder="Preco" inputMode="decimal" />
                        <Button onClick={() => void addOption()} disabled={savingAction === 'add-option'}>Adicionar opcao</Button>
                      </div>
                      <div className={styles.addonOptionsTable}>
                        {selectedGroup.options.length === 0 ? <EmptyState title="Sem opcoes" description="Adicione pelo menos uma opcao para vender este complemento." /> : null}
                        {selectedGroup.options.map((option) => {
                          const editing = editingOptionId === option.id;
                          return (
                            <div key={option.id} className={styles.addonOptionRow}>
                              {editing ? (
                                <>
                                  <Input value={editingOptionName} onChange={(event) => setEditingOptionName(event.target.value)} />
                                  <Input value={editingOptionPrice} onChange={(event) => setEditingOptionPrice(event.target.value)} inputMode="decimal" />
                                  <Button onClick={() => void saveOption(option)} disabled={savingAction === `option-${option.id}`}>Salvar</Button>
                                  <Button onClick={() => setEditingOptionId(null)}>Cancelar</Button>
                                </>
                              ) : (
                                <>
                                  <div>
                                    <strong>{option.name}</strong>
                                    <span>{money(option.price)}</span>
                                  </div>
                                  <Badge tone={option.available === false ? 'danger' : 'success'}>{option.available === false ? 'Inativa' : 'Ativa'}</Badge>
                                  <Button onClick={() => startEditOption(option)}>Editar</Button>
                                  <Button onClick={() => void toggleOption(option)} disabled={savingAction === `option-${option.id}`}>
                                    {option.available === false ? 'Ativar' : 'Desativar'}
                                  </Button>
                                  <Button variant="danger" onClick={() => void removeOption(option)} disabled={savingAction === `option-${option.id}`}>Excluir</Button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className={styles.addonProductMatrix}>
                      <div className={styles.addonCategoryColumn}>
                        <strong>Categorias</strong>
                        <div className={styles.addonCategoryList}>
                          {categories.map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              className={item.key === activeCategory ? styles.addonCategoryActive : ''}
                              onClick={() => setSelectedCategory(item.key)}
                            >
                              <span>{item.label}</span>
                              <Badge>{item.count}</Badge>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.addonProductsColumn}>
                        <div className={styles.addonBulkActions}>
                          <div>
                            <strong>Produtos da categoria</strong>
                            <span>{visibleProducts.length} produto(s) em {activeCategory}</span>
                          </div>
                          <div>
                            <Button
                              type="button"
                              disabled={savingAction === 'bulk-category' || visibleProducts.length === 0}
                              onClick={() => void updateCategoryLinks(true)}
                            >
                              Vincular todos
                            </Button>
                            <Button
                              type="button"
                              disabled={savingAction === 'bulk-category' || visibleProducts.length === 0}
                              onClick={() => void updateCategoryLinks(false)}
                            >
                              Remover todos
                            </Button>
                          </div>
                        </div>
                        <div className={styles.addonProductRows}>
                          {visibleProducts.map((product) => {
                            const checked = linkedSet.has(product.id);
                            return (
                              <label key={product.id} className={styles.addonProductRow}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={savingAction === `product-${product.id}`}
                                  onChange={(event) => void updateProductLinks(product.id, event.target.checked)}
                                />
                                <span>{product.name}</span>
                                <small>{product.sku ?? 'Sem SKU'} | {product.categoryName ?? 'Sem categoria'}</small>
                                <Badge tone={checked ? 'success' : 'default'}>
                                  {savingAction === `product-${product.id}` ? 'Salvando...' : checked ? 'Vinculado' : 'Nao vinculado'}
                                </Badge>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <EmptyState title="Selecione um complemento" description="Clique em um complemento da lista para editar regras, opcoes e vinculos." />
            )}
          </Card>
        </div>
      ) : null}
    </section>
  );
}
