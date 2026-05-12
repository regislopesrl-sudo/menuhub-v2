import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import {
  fetchAdminMenuAddonGroups,
  updateAdminMenuAddonGroupProducts,
  type MenuAddonGroup,
} from '@/features/menu/menu.api';
import type { MenuProduct } from '@/features/menu/menu.mock';
import styles from '../page.module.css';

type AddonCategoryRow = {
  key: string;
  label: string;
  count: number;
};

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
  const [savingProductId, setSavingProductId] = useState<string | null>(null);

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
        onError(err instanceof Error ? err.message : 'Falha ao carregar adicionais.');
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

  const selectedGroup = groupsWithFallbackLinks.find((group) => group.id === selectedGroupId) ?? null;
  const linkedSet = useMemo(() => new Set(selectedGroup?.linkedProductIds ?? []), [selectedGroup]);
  const productsWithAddons = products.filter((product) => (product.addonGroups ?? []).length > 0).length;

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
    return <EmptyState title="Nenhum produto cadastrado" description="Cadastre um produto antes de configurar adicionais." />;
  }

  const updateProductLinks = async (productId: string, checked: boolean) => {
    if (!selectedGroup) return;
    const currentIds = new Set(selectedGroup.linkedProductIds ?? []);
    if (checked) {
      currentIds.add(productId);
    } else {
      currentIds.delete(productId);
    }

    setSavingProductId(productId);
    try {
      const updated = await updateAdminMenuAddonGroupProducts({
        companyId,
        branchId,
        groupId: selectedGroup.id,
        productIds: Array.from(currentIds),
      });
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
      onNotice(checked ? 'Produto vinculado ao adicional.' : 'Produto removido do adicional.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao atualizar produtos do adicional.');
    } finally {
      setSavingProductId(null);
    }
  };

  return (
    <section className={styles.addonsHub}>
      <Card className={styles.addonsHubHero}>
        <div>
          <span>Central de adicionais</span>
          <strong>Gerencie grupos de adicionais e aplique em produtos.</strong>
          <p>
            Clique em um adicional, escolha a categoria e marque os produtos que devem usar esse mesmo grupo de opcoes.
          </p>
        </div>
        <div className={styles.addonsHubMetrics}>
          <Badge>{groupsWithFallbackLinks.length} adicionais</Badge>
          <Badge>{productsWithAddons} produtos com adicionais</Badge>
          <Badge>{products.length} produtos</Badge>
        </div>
      </Card>

      {loading ? <LoadingState label="Carregando central de adicionais..." /> : null}

      {!loading && groupsWithFallbackLinks.length === 0 ? (
        <EmptyState
          title="Nenhum adicional criado"
          description="Abra um produto e crie o primeiro grupo na secao Adicionais. Ele aparecera aqui para configuracao em massa."
        />
      ) : null}

      {groupsWithFallbackLinks.length > 0 ? (
        <div className={styles.addonsConfigurator}>
          <Card className={styles.addonGroupsSidebar}>
            <strong>Adicionais criados</strong>
            <span>Selecione o adicional para configurar.</span>
            <div className={styles.addonGroupList}>
              {groupsWithFallbackLinks.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={group.id === selectedGroup?.id ? styles.addonGroupActive : ''}
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  <span>{group.name}</span>
                  <small>
                    {group.productCount ?? 0} produto(s) | {group.options.length} opcao(oes)
                  </small>
                </button>
              ))}
            </div>
          </Card>

          <Card className={styles.addonConfigPanel}>
            {selectedGroup ? (
              <>
                <div className={styles.addonConfigHeader}>
                  <div>
                    <span>Pagina de configuracao do adicional</span>
                    <strong>{selectedGroup.name}</strong>
                    <p>
                      {selectedGroup.required ? 'Obrigatorio' : 'Opcional'} | Min {selectedGroup.minSelect} | Max {selectedGroup.maxSelect} |{' '}
                      {selectedGroup.allowMultiple ? 'Multipla escolha' : 'Escolha unica'}
                    </p>
                  </div>
                  <div className={styles.addonConfigActions}>
                    <Badge tone={selectedGroup.productCount ? 'success' : 'warning'}>
                      {selectedGroup.productCount ?? 0} vinculo(s)
                    </Badge>
                    <Button onClick={() => setSelectedGroupId(null)}>Fechar</Button>
                  </div>
                </div>

                <div className={styles.addonOptionsSummary}>
                  {selectedGroup.options.length > 0 ? (
                    selectedGroup.options.map((option) => (
                      <Badge key={option.id} tone={option.available ? 'success' : 'danger'}>
                        {option.name} | R$ {Number(option.price ?? 0).toFixed(2).replace('.', ',')}
                      </Badge>
                    ))
                  ) : (
                    <Badge tone="warning">Sem opcoes cadastradas</Badge>
                  )}
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
                    <strong>Produtos</strong>
                    <div className={styles.addonProductRows}>
                      {visibleProducts.map((product) => {
                        const checked = linkedSet.has(product.id);
                        return (
                          <label key={product.id} className={styles.addonProductRow}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={savingProductId === product.id}
                              onChange={(event) => void updateProductLinks(product.id, event.target.checked)}
                            />
                            <span>{product.name}</span>
                            <small>{product.sku ?? 'Sem SKU'} | {product.categoryName ?? 'Sem categoria'}</small>
                            <Badge tone={checked ? 'success' : 'default'}>
                              {savingProductId === product.id ? 'Salvando...' : checked ? 'Vinculado' : 'Nao vinculado'}
                            </Badge>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                title="Selecione um adicional"
                description="Clique em um adicional criado, como Molhos da Casa, para abrir a pagina de configuracao e vincular produtos."
              />
            )}
          </Card>
        </div>
      ) : null}
    </section>
  );
}
