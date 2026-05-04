'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { ModuleDisabled } from '@/components/module-disabled';
import {
  createAdminMenuProduct,
  createAdminMenuCategory,
  commitAdminMenuImport,
  deleteAdminMenuCategory,
  duplicateAdminMenuProduct,
  fetchAdminMenuCategories,
  fetchAdminMenuRecommendations,
  fetchAdminMenu,
  getMenuFallback,
  previewAdminMenuImport,
  reorderAdminMenuFeatured,
  saveAdminMenuRecommendations,
  updateAdminMenuCategory,
  updateAdminMenuProduct,
  updateAdminMenuProductAvailability,
  updateAdminMenuProductFeatured,
  type AdminMenuProductPayload,
  type AdminMenuCategory,
  type MenuImportPreview,
} from '@/features/menu/menu.api';
import type { MenuProduct, MenuRecommendationConfig } from '@/features/menu/menu.mock';
import { useModuleAccess } from '@/features/modules/use-module-access';
import { AddonsManagementPanel } from './components/AddonsManagementPanel';
import { FeaturedProductsPanel } from './components/FeaturedProductsPanel';
import { ImportProductsPanel } from './components/ImportProductsPanel';
import { ProductCard } from './components/ProductCard';
import { ProductFilters } from './components/ProductFilters';
import { ProductModal } from './components/ProductModal';
import { RecommendationsPanel } from './components/RecommendationsPanel';
import {
  normalizeProduct,
  primaryPrice,
  type AddonFilter,
  type AvailabilityFilter,
  type ChannelFilter,
  type MenuTab,
  type ModalMode,
} from './menu-view-model';

const MENU_TABS: Array<{ key: MenuTab; label: string }> = [
  { key: 'products', label: 'Produtos' },
  { key: 'categories', label: 'Categorias' },
  { key: 'addons', label: 'Adicionais' },
  { key: 'featured', label: 'Destaques' },
  { key: 'import', label: 'Importacao' },
  { key: 'recommendations', label: 'Peca tambem' },
];

export default function AdminMenuPage() {
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const access = useModuleAccess({ companyId, branchId, userRole: 'admin' }, 'menu');

  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [addonFilter, setAddonFilter] = useState<AddonFilter>('all');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [modal, setModal] = useState<{ mode: ModalMode; product?: MenuProduct } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingAction, setSavingAction] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MenuTab>('products');
  const [importCsv, setImportCsv] = useState('');
  const [importPreview, setImportPreview] = useState<MenuImportPreview | null>(null);
  const [recommendationConfig, setRecommendationConfig] = useState<MenuRecommendationConfig | null>(null);
  const [categoryRecords, setCategoryRecords] = useState<AdminMenuCategory[]>([]);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryDraftName, setCategoryDraftName] = useState('');
  const [editingCategory, setEditingCategory] = useState<AdminMenuCategory | null>(null);

  const load = async () => {
    if (access.loading || !access.allowed) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [data, categoriesData] = await Promise.all([
        fetchAdminMenu({ companyId, branchId }),
        fetchAdminMenuCategories({ companyId, branchId }).catch(() => []),
      ]);
      setProducts((Array.isArray(data) ? data : []).map(normalizeProduct));
      setCategoryRecords(Array.isArray(categoriesData) ? categoriesData : []);
    } catch (err) {
      setProducts(getMenuFallback().map(normalizeProduct));
      setCategoryRecords([]);
      setError(err instanceof Error ? err.message : 'Falha ao carregar cardapio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [access.allowed, access.loading, branchId, companyId]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(id);
  }, [query]);

  const categories = useMemo(() => {
    const map = new Map<string, { id?: string; name: string; count: number; active?: boolean }>();
    categoryRecords.forEach((item) => {
      map.set(item.name, { id: item.id, name: item.name, count: 0, active: item.active !== false });
    });
    products.forEach((product) => {
      const key = product.categoryName ?? 'Sem categoria';
      const current = map.get(key);
      map.set(key, {
        id: current?.id ?? product.categoryId,
        name: key,
        count: (current?.count ?? 0) + 1,
        active: current?.active ?? true,
      });
    });
    return [{ name: 'all', count: products.length }, ...Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))];
  }, [categoryRecords, products]);

  const filteredProducts = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch = !q || product.name.toLowerCase().includes(q) || (product.description ?? '').toLowerCase().includes(q);
      const matchesCategory = category === 'all' || product.categoryName === category;
      const matchesAvailability =
        availability === 'all' ||
        (availability === 'active' && product.available !== false) ||
        (availability === 'inactive' && product.available === false);
      const matchesChannel = channel === 'all' || product.channels?.[channel] === true;
      const addonCount = (product.addonGroups ?? []).length;
      const matchesAddons =
        addonFilter === 'all' ||
        (addonFilter === 'with' && addonCount > 0) ||
        (addonFilter === 'without' && addonCount === 0);
      const price = primaryPrice(product);
      const min = minPrice.trim() ? Number(minPrice) : undefined;
      const max = maxPrice.trim() ? Number(maxPrice) : undefined;
      const matchesPrice =
        (min === undefined || Number.isNaN(min) || price >= min) &&
        (max === undefined || Number.isNaN(max) || price <= max);
      return matchesSearch && matchesCategory && matchesAvailability && matchesChannel && matchesAddons && matchesPrice;
    });
  }, [addonFilter, availability, category, channel, debouncedQuery, maxPrice, minPrice, products]);

  const stats = useMemo(() => {
    const active = products.filter((product) => product.available !== false).length;
    const categoryCount = new Set(products.map((product) => product.categoryName ?? 'Sem categoria')).size;
    const featured = products.filter((product) => product.featured).length;
    const noPrice = products.filter((product) => Number(product.salePrice ?? product.price ?? 0) <= 0).length;
    return { active, unavailable: products.length - active, categoryCount, featured, noPrice };
  }, [products]);

  const featuredProducts = useMemo(
    () => products.filter((product) => product.featured).sort((a, b) => (a.featuredSortOrder ?? 0) - (b.featuredSortOrder ?? 0)),
    [products],
  );

  if (access.loading) {
    return <main className={styles.page}><LoadingState label="Validando acesso ao modulo..." /></main>;
  }

  if (!access.allowed) {
    return <ModuleDisabled moduleName="Menu / Catalogo" reason={access.error ?? 'Modulo menu desativado.'} />;
  }

  const openCategoryModal = (categoryToEdit?: AdminMenuCategory) => {
    setEditingCategory(categoryToEdit ?? null);
    setCategoryDraftName(categoryToEdit?.name ?? '');
    setCategoryModalOpen(true);
  };

  const closeCategoryModal = () => {
    setCategoryModalOpen(false);
    setEditingCategory(null);
    setCategoryDraftName('');
  };

  const saveCategory = async () => {
    const name = categoryDraftName.trim();
    if (!name) {
      setError('Informe o nome da categoria.');
      return;
    }
    setSavingAction('save-category');
    setError(null);
    try {
      const saved = editingCategory?.id
        ? await updateAdminMenuCategory({ companyId, branchId, categoryId: editingCategory.id, payload: { name } })
        : await createAdminMenuCategory({ companyId, branchId, name });
      setCategoryRecords((prev) => {
        const exists = prev.some((item) => item.id === saved.id);
        return exists ? prev.map((item) => (item.id === saved.id ? saved : item)) : [...prev, saved];
      });
      if (editingCategory) {
        setProducts((prev) =>
          prev.map((product) =>
            product.categoryId === saved.id || product.categoryName === editingCategory.name
              ? { ...product, categoryId: saved.id, categoryName: saved.name }
              : product,
          ),
        );
      }
      setCategory(saved.name);
      closeCategoryModal();
      setNotice(editingCategory ? 'Categoria atualizada com sucesso.' : 'Categoria criada com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar categoria.');
    } finally {
      setSavingAction(null);
    }
  };

  const removeCategory = async (categoryToDelete: AdminMenuCategory) => {
    if (!categoryToDelete.id) return;
    const productCount = categoryToDelete.count ?? 0;
    const message =
      productCount > 0
        ? `Remover a categoria "${categoryToDelete.name}"? ${productCount} produtos ficarao como "Sem categoria".`
        : `Remover a categoria "${categoryToDelete.name}"?`;
    if (!window.confirm(message)) return;
    setSavingAction(`delete-category-${categoryToDelete.id}`);
    setError(null);
    try {
      const result = await deleteAdminMenuCategory({ companyId, branchId, categoryId: categoryToDelete.id });
      setCategoryRecords((prev) => prev.filter((item) => item.id !== categoryToDelete.id));
      setProducts((prev) =>
        prev.map((product) =>
          product.categoryId === categoryToDelete.id || product.categoryName === categoryToDelete.name
            ? { ...product, categoryId: undefined, categoryName: 'Sem categoria' }
            : product,
        ),
      );
      if (category === categoryToDelete.name) setCategory('all');
      setNotice(`Categoria removida. ${result.affectedProducts ?? 0} produtos foram desvinculados.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover categoria.');
    } finally {
      setSavingAction(null);
    }
  };

  const upsertProduct = (product: MenuProduct) => {
    const normalized = normalizeProduct(product);
    setProducts((prev) => {
      const exists = prev.some((item) => item.id === normalized.id);
      if (!exists) return [normalized, ...prev];
      return prev.map((item) => (item.id === normalized.id ? normalized : item));
    });
  };

  const saveProduct = async (payload: AdminMenuProductPayload, product?: MenuProduct) => {
    setSavingAction('save');
    setError(null);
    try {
      const saved = product?.id
        ? await updateAdminMenuProduct({ companyId, branchId, productId: product.id, payload })
        : await createAdminMenuProduct({ companyId, branchId, payload });
      upsertProduct(saved);
      setModal(null);
      setNotice(product?.id ? 'Produto atualizado com sucesso.' : 'Produto criado com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar produto.');
    } finally {
      setSavingAction(null);
    }
  };

  const toggleAvailability = async (product: MenuProduct) => {
    setSavingAction(`toggle-${product.id}`);
    setError(null);
    try {
      const updated = await updateAdminMenuProductAvailability({
        companyId,
        branchId,
        productId: product.id,
        available: product.available === false,
        channels: product.channels,
      });
      upsertProduct(updated);
      setNotice(updated.available === false ? 'Produto desativado.' : 'Produto ativado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar disponibilidade.');
    } finally {
      setSavingAction(null);
    }
  };

  const duplicateProduct = async (product: MenuProduct) => {
    if (!window.confirm(`Duplicar o produto "${product.name}"? A copia nasce inativa para revisao.`)) return;
    setSavingAction(`duplicate-${product.id}`);
    setError(null);
    try {
      const duplicated = await duplicateAdminMenuProduct({ companyId, branchId, productId: product.id });
      upsertProduct(duplicated);
      setNotice('Produto duplicado como inativo para revisao.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao duplicar produto.');
    } finally {
      setSavingAction(null);
    }
  };

  const toggleFeatured = async (product: MenuProduct) => {
    setSavingAction(`featured-${product.id}`);
    setError(null);
    try {
      const updated = await updateAdminMenuProductFeatured({ companyId, branchId, productId: product.id, featured: !product.featured });
      upsertProduct(updated);
      setNotice(updated.featured ? 'Produto marcado como destaque.' : 'Produto removido dos destaques.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar destaque.');
    } finally {
      setSavingAction(null);
    }
  };

  const moveFeatured = async (productId: string, direction: -1 | 1) => {
    const current = featuredProducts.map((product) => product.id);
    const index = current.indexOf(productId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
    const next = [...current];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setSavingAction('reorder-featured');
    try {
      const result = await reorderAdminMenuFeatured({ companyId, branchId, productIds: next });
      result.products.forEach(upsertProduct);
      setNotice('Ordem dos destaques salva.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ordenar destaques.');
    } finally {
      setSavingAction(null);
    }
  };

  const previewImport = async () => {
    setSavingAction('import-preview');
    setError(null);
    try {
      setImportPreview(await previewAdminMenuImport({ companyId, branchId, csv: importCsv }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao validar importacao.');
    } finally {
      setSavingAction(null);
    }
  };

  const commitImport = async () => {
    setSavingAction('import-commit');
    setError(null);
    try {
      const result = await commitAdminMenuImport({ companyId, branchId, csv: importCsv });
      result.products.forEach(upsertProduct);
      setNotice(`${result.importedCount} produtos importados. ${result.skippedCount} linhas ignoradas.`);
      setImportPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao importar produtos.');
    } finally {
      setSavingAction(null);
    }
  };

  const openRecommendations = async (product: MenuProduct) => {
    setSavingAction(`recommendations-${product.id}`);
    setRecommendationConfig(null);
    setModal({ mode: 'recommendations', product });
    try {
      setRecommendationConfig(await fetchAdminMenuRecommendations({ companyId, branchId, productId: product.id }));
    } catch {
      setRecommendationConfig({ title: 'Peca tambem', type: 'manual', limit: 4, active: true, productIds: [] });
    } finally {
      setSavingAction(null);
    }
  };

  const saveRecommendations = async (product: MenuProduct, payload: MenuRecommendationConfig) => {
    setSavingAction('save-recommendations');
    try {
      const saved = await saveAdminMenuRecommendations({ companyId, branchId, productId: product.id, payload });
      upsertProduct({ ...product, recommendations: saved });
      setModal(null);
      setRecommendationConfig(null);
      setNotice('Configuracao de Peca tambem salva.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar recomendacoes.');
    } finally {
      setSavingAction(null);
    }
  };

  return (
    <main className={styles.page}>
      <PageHeader
        title="Catalogo"
        subtitle="Gerencie produtos, categorias, precos e adicionais"
        right={
          <div className={styles.headerActions}>
            <Badge tone={error ? 'warning' : 'success'}>{error ? 'Fallback local' : 'API conectada'}</Badge>
            <Button variant="primary" onClick={() => setModal({ mode: 'create' })}>Novo produto</Button>
            <Button onClick={() => openCategoryModal()}>Nova categoria</Button>
            <Button onClick={() => setActiveTab('import')}>Importar produtos</Button>
            <Button onClick={() => setActiveTab('addons')}>Gerenciar adicionais</Button>
            <Button onClick={() => void load()}>Atualizar</Button>
          </div>
        }
      />

      <section className={styles.metrics}>
        <Card className={styles.metric}><span>Total</span><strong>{products.length}</strong></Card>
        <Card className={styles.metric}><span>Ativos</span><strong>{stats.active}</strong></Card>
        <Card className={styles.metric}><span>Destacados</span><strong>{stats.featured}</strong></Card>
        <Card className={styles.metric}><span>Sem preco</span><strong>{stats.noPrice}</strong></Card>
        <Card className={styles.metric}><span>Indisponiveis</span><strong>{stats.unavailable}</strong></Card>
      </section>

      <SectionTabs tabs={MENU_TABS} active={activeTab} onChange={setActiveTab} />

      {notice ? (
        <div className={styles.notice}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>Fechar</button>
        </div>
      ) : null}

      {error ? (
        <div className={styles.warning}>
          <strong>Cardapio real indisponivel.</strong>
          <span>Exibindo dados locais para manter a tela operacional.</span>
        </div>
      ) : null}

      {activeTab === 'products' ? (
        <section className={styles.workspace}>
          <aside className={styles.categories}>
            <div className={styles.sidebarTitle}>Categorias</div>
            {categories.map((item) => (
              <button
                type="button"
                key={item.name}
                className={`${styles.categoryButton} ${category === item.name ? styles.categoryActive : ''}`.trim()}
                onClick={() => setCategory(item.name)}
              >
                <span>{item.name === 'all' ? 'Todas' : item.name}</span>
                <Badge>{item.count}</Badge>
              </button>
            ))}
          </aside>

          <section className={styles.content}>
            <ProductFilters
              query={query}
              onQueryChange={setQuery}
              category={category}
              onCategoryChange={setCategory}
              availability={availability}
              onAvailabilityChange={setAvailability}
              channel={channel}
              onChannelChange={setChannel}
              addonFilter={addonFilter}
              onAddonFilterChange={setAddonFilter}
              minPrice={minPrice}
              onMinPriceChange={setMinPrice}
              maxPrice={maxPrice}
              onMaxPriceChange={setMaxPrice}
              categories={categories}
            />

            {loading ? <LoadingState label="Carregando catalogo..." /> : null}
            {!loading && filteredProducts.length === 0 ? <EmptyState title="Nenhum produto encontrado" description="Ajuste os filtros ou cadastre um novo produto." /> : null}
            {!loading && filteredProducts.length > 0 ? (
              <section className={styles.grid}>
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onEdit={() => setModal({ mode: 'edit', product })}
                    onAddons={() => setModal({ mode: 'addons', product })}
                    onToggle={() => void toggleAvailability(product)}
                    onDuplicate={() => void duplicateProduct(product)}
                    onFeatured={() => void toggleFeatured(product)}
                    onRecommendations={() => void openRecommendations(product)}
                    actionLoading={savingAction}
                  />
                ))}
              </section>
            ) : null}
          </section>
        </section>
      ) : null}

      {activeTab === 'categories' ? (
        <section className={styles.simpleGrid}>
          {categories.filter((item) => item.name !== 'all').length === 0 ? (
            <EmptyState title="Sem categorias" description="Crie a primeira categoria para organizar o catalogo." />
          ) : null}
          {categories.filter((item) => item.name !== 'all').map((item) => (
            <Card key={item.name} className={styles.managementCard}>
              <div className={styles.categoryCardHeader}>
                <strong>{item.name}</strong>
                <Badge tone={item.active === false ? 'warning' : 'success'}>{item.active === false ? 'Inativa' : 'Ativa'}</Badge>
              </div>
              <span>{item.count} produtos</span>
              {item.id ? (
                <div className={styles.managementActions}>
                  <Button onClick={() => openCategoryModal(item as AdminMenuCategory)}>Editar</Button>
                  <Button
                    onClick={() => void removeCategory(item as AdminMenuCategory)}
                    disabled={savingAction === `delete-category-${item.id}`}
                  >
                    {savingAction === `delete-category-${item.id}` ? 'Removendo...' : 'Remover'}
                  </Button>
                </div>
              ) : (
                <span>Categoria detectada em produtos antigos. Edite o produto para vincular a uma categoria real.</span>
              )}
            </Card>
          ))}
          <Card className={styles.managementCard}>
            <strong>Nova categoria</strong>
            <span>Organize produtos por grupos operacionais.</span>
            <Button variant="primary" onClick={() => openCategoryModal()}>Criar categoria</Button>
          </Card>
        </section>
      ) : null}

      {activeTab === 'addons' ? <AddonsManagementPanel products={products} onOpenAddons={(product) => setModal({ mode: 'addons', product })} /> : null}

      {activeTab === 'featured' ? (
        <FeaturedProductsPanel products={featuredProducts} allProducts={products} savingAction={savingAction} onMove={(id, direction) => void moveFeatured(id, direction)} onToggleFeatured={(product) => void toggleFeatured(product)} />
      ) : null}

      {activeTab === 'import' ? (
        <ImportProductsPanel importCsv={importCsv} onImportCsvChange={setImportCsv} importPreview={importPreview} savingAction={savingAction} onPreview={() => void previewImport()} onCommit={() => void commitImport()} />
      ) : null}

      {activeTab === 'recommendations' ? <RecommendationsPanel products={products} onOpenRecommendations={(product) => void openRecommendations(product)} /> : null}

      {modal ? (
        <ProductModal
          mode={modal.mode}
          product={modal.product}
          onClose={() => setModal(null)}
          onSave={(payload) => void saveProduct(payload, modal.product)}
          onSaveRecommendations={(payload) => modal.product ? void saveRecommendations(modal.product, payload) : undefined}
          companyId={companyId}
          branchId={branchId}
          onProductChanged={upsertProduct}
          onError={(message) => setError(message)}
          onNotice={(message) => setNotice(message)}
          recommendationConfig={recommendationConfig}
          products={products}
          saving={savingAction === 'save' || savingAction === 'save-recommendations'}
        />
      ) : null}

      {categoryModalOpen ? (
        <div className={styles.modalBackdrop} onClick={closeCategoryModal}>
          <Card className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>{editingCategory ? 'Editar categoria' : 'Nova categoria'}</h2>
                <p>{editingCategory ? 'Atualize o nome exibido no catalogo.' : 'Crie uma categoria real para organizar o catalogo.'}</p>
              </div>
              <Button onClick={closeCategoryModal}>Fechar</Button>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.wide}>
                Nome da categoria
                <Input value={categoryDraftName} onChange={(event) => setCategoryDraftName(event.target.value)} placeholder="Ex: Combos" />
              </label>
            </div>
            <div className={styles.modalActions}>
              <Button onClick={closeCategoryModal}>Cancelar</Button>
              <Button variant="primary" onClick={() => void saveCategory()} disabled={savingAction === 'save-category'}>
                {savingAction === 'save-category' ? 'Salvando...' : editingCategory ? 'Salvar categoria' : 'Criar categoria'}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
