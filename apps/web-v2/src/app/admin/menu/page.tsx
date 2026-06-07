'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { ModuleDisabled } from '@/components/module-disabled';
import {
  createAdminMenuCombo,
  deleteAdminMenuCombo,
  fetchAdminMenuCombos,
  updateAdminMenuCombo,
  createAdminMenuProduct,
  createAdminMenuCategory,
  commitAdminMenuImport,
  deleteAdminMenuCategory,
  deleteAdminMenuProduct,
  deleteAdminMenuProductVariation,
  duplicateAdminMenuProduct,
  fetchAdminMenuCategories,
  fetchAdminMenuProductVariations,
  fetchAdminMenuRecommendations,
  fetchAdminMenu,
  getMenuFallback,
  previewAdminMenuImport,
  reorderAdminMenuFeatured,
  saveAdminMenuRecommendations,
  createAdminMenuProductVariation,
  updateAdminMenuCategory,
  updateAdminMenuProduct,
  updateAdminMenuProductAvailability,
  updateAdminMenuProductFeatured,
  updateAdminMenuProductVariation,
  type AdminMenuComboPayload,
  type AdminMenuProductPayload,
  type AdminMenuCategory,
  type MenuImportPreview,
} from '@/features/menu/menu.api';
import type { MenuCombo, MenuProduct, MenuRecommendationConfig } from '@/features/menu/menu.mock';
import { useModuleAccess } from '@/features/modules/use-module-access';
import { AddonOptionsPanel } from './components/AddonOptionsPanel';
import { AddonsManagementPanel } from './components/AddonsManagementPanel';
import { FeaturedProductsPanel } from './components/FeaturedProductsPanel';
import { ImportProductsPanel } from './components/ImportProductsPanel';
import { ProductFilters } from './components/ProductFilters';
import { ProductModal } from './components/ProductModal';
import { RecommendationsPanel } from './components/RecommendationsPanel';
import {
  brl,
  normalizeProduct,
  primaryPrice,
  type AddonFilter,
  type AvailabilityFilter,
  type CategorySummary,
  type ChannelFilter,
  type MenuTab,
  type ModalMode,
} from './menu-view-model';

const CATALOG_TABS: Array<{ key: MenuTab; label: string }> = [
  { key: 'products', label: 'Produtos' },
  { key: 'categories', label: 'Categorias' },
  { key: 'addons', label: 'Complementos' },
  { key: 'options', label: 'Opcoes' },
  { key: 'combos', label: 'Combos' },
  { key: 'featured', label: 'Destaques' },
  { key: 'import', label: 'Importacao' },
  { key: 'recommendations', label: 'Peca tambem' },
  { key: 'audit', label: 'Filtros avancados' },
];

const ALL_MENU_TABS: MenuTab[] = [
  'products',
  'categories',
  'addons',
  'options',
  'combos',
  'availability',
  'media',
  'deliveryPublication',
  'featured',
  'import',
  'recommendations',
  'audit',
];

const KITCHEN_STATION_LABELS: Record<NonNullable<MenuProduct['kitchenStation']>, string> = {
  FRYER: 'Fritadeira',
  DRINKS: 'Bar',
  DESSERTS: 'Sobremesas',
  EXPEDITION: 'Expedicao',
};

function productCode(product: MenuProduct) {
  return product.sku?.trim() || product.id.slice(0, 8);
}

function productSector(product: MenuProduct) {
  return product.kitchenStation ? KITCHEN_STATION_LABELS[product.kitchenStation] : 'Geral';
}

function productFinancials(product: MenuProduct) {
  const price = primaryPrice(product);
  const cost = Number(product.costPrice ?? 0);
  const hasCost = cost > 0;
  const margin = price > 0 && hasCost ? ((price - cost) / price) * 100 : null;
  const cmv = price > 0 && hasCost ? (cost / price) * 100 : null;
  return { price, cost, margin, cmv };
}

function percent(value: number | null) {
  if (value === null || Number.isNaN(value)) return '-';
  return `${value.toFixed(1).replace('.', ',')}%`;
}

export default function AdminMenuPage() {
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const router = useRouter();
  const searchParams = useSearchParams();
  const access = useModuleAccess({ companyId, branchId, userRole: 'admin' }, 'menu');

  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [combos, setCombos] = useState<MenuCombo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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
  const [categoryDraftSortOrder, setCategoryDraftSortOrder] = useState('0');
  const [editingCategory, setEditingCategory] = useState<AdminMenuCategory | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  const load = async () => {
    if (access.loading || !access.allowed) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const [data, categoriesData, combosData] = await Promise.all([
        fetchAdminMenu({ companyId, branchId }),
        fetchAdminMenuCategories({ companyId, branchId }).catch(() => []),
        fetchAdminMenuCombos({ companyId, branchId }).catch(() => []),
      ]);
      setProducts((Array.isArray(data) ? data : []).map(normalizeProduct));
      setCategoryRecords(Array.isArray(categoriesData) ? categoriesData : []);
      setCombos(Array.isArray(combosData) ? combosData : []);
    } catch (err) {
      setProducts(getMenuFallback().map(normalizeProduct));
      setCategoryRecords([]);
      setCombos([]);
      setLoadError(err instanceof Error ? err.message : 'Falha ao carregar cardapio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [access.allowed, access.loading, branchId, companyId]);

  useEffect(() => {
    const requestedTab = searchParams.get('tab') as MenuTab | null;
    if (requestedTab && ALL_MENU_TABS.includes(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [searchParams]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(id);
  }, [query]);

  const categories = useMemo(() => {
    const map = new Map<string, CategorySummary>();
    categoryRecords.forEach((item) => {
      map.set(item.name, { id: item.id, name: item.name, count: 0, active: item.active !== false, sortOrder: item.sortOrder ?? 0 });
    });
    products.forEach((product) => {
      const key = product.categoryName ?? 'Sem categoria';
      const current = map.get(key);
      map.set(key, {
        id: current?.id ?? product.categoryId,
        name: key,
        count: (current?.count ?? 0) + 1,
        active: current?.active ?? true,
        sortOrder: current?.sortOrder ?? 0,
      });
    });
    return [
      { name: 'all', count: products.length },
      ...Array.from(map.values()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)),
    ];
  }, [categoryRecords, products]);

  const productCategories = useMemo(() => categories.filter((item) => item.name !== 'all'), [categories]);
  const selectedProductCategory = productCategories.some((item) => item.name === category) ? category : productCategories[0]?.name ?? '';

  useEffect(() => {
    if (activeTab !== 'products') return;
    if (productCategories.length === 0) {
      if (category) setCategory('');
      return;
    }
    if (!productCategories.some((item) => item.name === category)) {
      setCategory(productCategories[0].name);
    }
  }, [activeTab, category, productCategories]);

  useEffect(() => {
    setSelectedProductIds((current) => current.filter((id) => products.some((product) => product.id === id)));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!selectedProductCategory) return [];
    return products.filter((product) => {
      const matchesSearch = !q || product.name.toLowerCase().includes(q) || (product.description ?? '').toLowerCase().includes(q);
      const matchesCategory = (product.categoryName ?? 'Sem categoria') === selectedProductCategory;
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
  }, [addonFilter, availability, channel, debouncedQuery, maxPrice, minPrice, products, selectedProductCategory]);

  const featuredProducts = useMemo(
    () => products.filter((product) => product.featured).sort((a, b) => (a.featuredSortOrder ?? 0) - (b.featuredSortOrder ?? 0)),
    [products],
  );

  const hiddenDeliveryProducts = useMemo(() => products.filter((product) => product.channels?.delivery === false), [products]);
  const productsWithoutImage = useMemo(() => products.filter((product) => !product.imageUrl?.trim()), [products]);
  const productsWithoutDescription = useMemo(() => products.filter((product) => !product.description?.trim()), [products]);
  const productsWithoutTechnicalSheet = useMemo(() => products.filter((product) => !hasTechnicalSheet(product)), [products]);
  const unavailableProducts = useMemo(() => products.filter((product) => product.available === false), [products]);
  const selectedProducts = useMemo(
    () => products.filter((product) => selectedProductIds.includes(product.id)),
    [products, selectedProductIds],
  );
  const selectedCategoryRecord = productCategories.find((item) => item.name === selectedProductCategory);

  if (access.loading) {
    return <main className={styles.page}><LoadingState label="Validando acesso ao modulo..." /></main>;
  }

  if (!access.allowed) {
    return <ModuleDisabled moduleName="Menu / Catalogo" reason={access.error ?? 'Modulo menu desativado.'} />;
  }

  const openCategoryModal = (categoryToEdit?: AdminMenuCategory) => {
    setEditingCategory(categoryToEdit ?? null);
    setCategoryDraftName(categoryToEdit?.name ?? '');
    setCategoryDraftSortOrder(String(categoryToEdit?.sortOrder ?? '0'));
    setCategoryModalOpen(true);
  };

  const closeCategoryModal = () => {
    setCategoryModalOpen(false);
    setEditingCategory(null);
    setCategoryDraftName('');
    setCategoryDraftSortOrder('0');
  };

  const saveCategory = async () => {
    const name = categoryDraftName.trim();
    if (!name) {
      setActionError('Informe o nome da categoria.');
      return;
    }
    const sortOrder = Number(categoryDraftSortOrder || '0');
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      setActionError('Informe uma ordem de categoria valida.');
      return;
    }
    setSavingAction('save-category');
    setActionError(null);
    try {
      const saved = editingCategory?.id
        ? await updateAdminMenuCategory({ companyId, branchId, categoryId: editingCategory.id, payload: { name, sortOrder } })
        : await createAdminMenuCategory({ companyId, branchId, name, sortOrder });
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
      setActionError(err instanceof Error ? err.message : 'Falha ao salvar categoria.');
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
    setActionError(null);
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
      setActionError(err instanceof Error ? err.message : 'Falha ao remover categoria.');
    } finally {
      setSavingAction(null);
    }
  };

  const moveCategory = async (categoryToMove: AdminMenuCategory, direction: -1 | 1) => {
    if (!categoryToMove.id || savingAction) return;
    const ordered = categories.filter(
      (item): item is AdminMenuCategory & { id: string } => item.name !== 'all' && Boolean(item.id),
    );
    const currentIndex = ordered.findIndex((item) => item.id === categoryToMove.id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;

    const nextOrder = [...ordered];
    const [moved] = nextOrder.splice(currentIndex, 1);
    nextOrder.splice(nextIndex, 0, moved);
    const updates = nextOrder.map((item, index) => ({ ...item, sortOrder: index + 1 }));

    setSavingAction('reorder-categories');
    setActionError(null);
    setCategoryRecords((prev) =>
      prev.map((item) => {
        const updated = updates.find((candidate) => candidate.id === item.id);
        return updated ? { ...item, sortOrder: updated.sortOrder } : item;
      }),
    );
    try {
      await Promise.all(
        updates.map((item) =>
          updateAdminMenuCategory({
            companyId,
            branchId,
            categoryId: item.id,
            payload: { sortOrder: item.sortOrder },
          }),
        ),
      );
      setNotice('Ordem das categorias atualizada.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao reorganizar categorias.');
      await load();
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
    setActionError(null);
    try {
      const saved = product?.id
        ? await updateAdminMenuProduct({ companyId, branchId, productId: product.id, payload })
        : await createAdminMenuProduct({ companyId, branchId, payload });
      upsertProduct(saved);
      setModal(null);
      setNotice(product?.id ? 'Produto atualizado com sucesso.' : 'Produto criado com sucesso.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao salvar produto.');
    } finally {
      setSavingAction(null);
    }
  };

  const removeProduct = async (product: MenuProduct) => {
    const message = `Excluir o produto "${product.name}"? Ele saira do catalogo e do cardapio, mas pedidos antigos continuam preservados.`;
    if (!window.confirm(message)) return;
    setSavingAction(`delete-${product.id}`);
    setActionError(null);
    try {
      await deleteAdminMenuProduct({ companyId, branchId, productId: product.id });
      setProducts((prev) => prev.filter((item) => item.id !== product.id));
      setModal((current) => (current?.product?.id === product.id ? null : current));
      setNotice('Produto excluido do catalogo.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao excluir produto.');
    } finally {
      setSavingAction(null);
    }
  };

  const toggleAvailability = async (product: MenuProduct) => {
    setSavingAction(`toggle-${product.id}`);
    setActionError(null);
    try {
      const updated = await updateAdminMenuProductAvailability({
        companyId,
        branchId,
        productId: product.id,
        available: product.available === false,
        channels: product.channels,
      });
      upsertProduct(updated);
      setModal((current) => (current?.product?.id === product.id ? { ...current, product: updated } : current));
      setNotice(updated.available === false ? 'Produto desativado.' : 'Produto ativado.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao atualizar disponibilidade.');
    } finally {
      setSavingAction(null);
    }
  };

  const duplicateProduct = async (product: MenuProduct) => {
    if (!window.confirm(`Duplicar o produto "${product.name}"? A copia nasce inativa para revisao.`)) return;
    setSavingAction(`duplicate-${product.id}`);
    setActionError(null);
    try {
      const duplicated = await duplicateAdminMenuProduct({ companyId, branchId, productId: product.id });
      upsertProduct(duplicated);
      setModal({ mode: 'edit', product: duplicated });
      setNotice('Produto duplicado como inativo para revisao.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao duplicar produto.');
    } finally {
      setSavingAction(null);
    }
  };

  const toggleFeatured = async (product: MenuProduct) => {
    setSavingAction(`featured-${product.id}`);
    setActionError(null);
    try {
      const updated = await updateAdminMenuProductFeatured({ companyId, branchId, productId: product.id, featured: !product.featured });
      upsertProduct(updated);
      setModal((current) => (current?.product?.id === product.id ? { ...current, product: updated } : current));
      setNotice(updated.featured ? 'Produto marcado como destaque.' : 'Produto removido dos destaques.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao atualizar destaque.');
    } finally {
      setSavingAction(null);
    }
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId],
    );
  };

  const selectFilteredProducts = () => {
    setSelectedProductIds(filteredProducts.map((product) => product.id));
  };

  const bulkAvailability = async (available: boolean) => {
    if (!selectedProducts.length) {
      setActionError('Selecione ao menos um produto para aplicar a acao.');
      return;
    }
    setSavingAction('bulk-availability');
    setActionError(null);
    try {
      const updated = await Promise.all(
        selectedProducts.map((product) =>
          updateAdminMenuProductAvailability({
            companyId,
            branchId,
            productId: product.id,
            available,
            channels: product.channels,
          }),
        ),
      );
      updated.forEach(upsertProduct);
      setNotice(`${updated.length} produtos ${available ? 'ativados' : 'desativados'}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao aplicar disponibilidade em massa.');
    } finally {
      setSavingAction(null);
    }
  };

  const updateDeliveryVisibilityForProducts = async (productsToUpdate: MenuProduct[], visible: boolean) => {
    if (!productsToUpdate.length) {
      setActionError('Selecione ao menos um produto para aplicar a acao.');
      return;
    }
    setSavingAction('bulk-delivery');
    setActionError(null);
    try {
      const updated = await Promise.all(
        productsToUpdate.map((product) =>
          updateAdminMenuProductAvailability({
            companyId,
            branchId,
            productId: product.id,
            available: product.available !== false,
            channels: { ...product.channels, delivery: visible },
          }),
        ),
      );
      updated.forEach(upsertProduct);
      setNotice(`${updated.length} produtos ${visible ? 'visiveis no delivery' : 'ocultos no delivery'}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao atualizar publicacao no delivery.');
    } finally {
      setSavingAction(null);
    }
  };

  const bulkDeliveryVisibility = async (visible: boolean) => {
    await updateDeliveryVisibilityForProducts(selectedProducts, visible);
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
      setActionError(err instanceof Error ? err.message : 'Falha ao ordenar destaques.');
    } finally {
      setSavingAction(null);
    }
  };

  const previewImport = async () => {
    setSavingAction('import-preview');
    setActionError(null);
    try {
      setImportPreview(await previewAdminMenuImport({ companyId, branchId, csv: importCsv }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao validar importacao.');
    } finally {
      setSavingAction(null);
    }
  };

  const commitImport = async () => {
    setSavingAction('import-commit');
    setActionError(null);
    try {
      const result = await commitAdminMenuImport({ companyId, branchId, csv: importCsv });
      result.products.forEach(upsertProduct);
      setNotice(`${result.importedCount} produtos importados. ${result.skippedCount} linhas ignoradas.`);
      setImportPreview(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao importar produtos.');
    } finally {
      setSavingAction(null);
    }
  };

  const openTechnicalSheet = (product: MenuProduct) => {
    setModal(null);
    router.push(`/admin/technical-sheet/${product.id}`);
  };

  const openRecommendations = async (product: MenuProduct) => {
    setSavingAction(`recommendations-${product.id}`);
    setActionError(null);
    try {
      const config = await fetchAdminMenuRecommendations({ companyId, branchId, productId: product.id });
      setRecommendationConfig(config);
      setModal({ mode: 'recommendations', product });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao carregar recomendacoes.');
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
      setActionError(err instanceof Error ? err.message : 'Falha ao salvar recomendacoes.');
    } finally {
      setSavingAction(null);
    }
  };

  const saveCombo = async (payload: AdminMenuComboPayload, combo?: MenuCombo) => {
    setSavingAction(combo?.id ? `save-combo-${combo.id}` : 'save-combo');
    setActionError(null);
    try {
      const saved = combo?.id
        ? await updateAdminMenuCombo({ companyId, branchId, comboId: combo.id, payload })
        : await createAdminMenuCombo({ companyId, branchId, payload });
      setCombos((prev) => {
        const exists = prev.some((item) => item.id === saved.id);
        return exists ? prev.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...prev];
      });
      setNotice(combo?.id ? 'Combo atualizado com sucesso.' : 'Combo criado com sucesso.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao salvar combo.');
    } finally {
      setSavingAction(null);
    }
  };

  const disableCombo = async (combo: MenuCombo) => {
    setSavingAction(`delete-combo-${combo.id}`);
    setActionError(null);
    try {
      const saved = await deleteAdminMenuCombo({ companyId, branchId, comboId: combo.id });
      setCombos((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      setNotice('Combo desativado.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao desativar combo.');
    } finally {
      setSavingAction(null);
    }
  };

  return (
    <main className={styles.page}>
      <PageHeader
        title="Catalogo"
        subtitle="Produtos, categorias, complementos, combos e IA do cardapio"
        right={
          <div className={styles.headerActions}>
            <Badge tone={loadError ? 'warning' : 'success'}>{loadError ? 'Fallback local' : 'API conectada'}</Badge>
            <Button variant="primary" onClick={() => setModal({ mode: 'create' })}>Novo produto</Button>
          </div>
        }
      />

      <SectionTabs tabs={CATALOG_TABS} active={activeTab} onChange={setActiveTab} />

      {notice ? (
        <div className={styles.notice}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>Fechar</button>
        </div>
      ) : null}

      {loadError ? (
        <div className={styles.warning}>
          <strong>Cardapio real indisponivel.</strong>
          <span>{loadError}. Exibindo dados locais para manter a tela operacional.</span>
        </div>
      ) : null}

      {actionError ? (
        <div className={styles.warning}>
          <strong>Acao nao concluida.</strong>
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)}>Fechar</button>
        </div>
      ) : null}

      {activeTab === 'products' ? (
        <section className={styles.workspace}>
          <aside className={styles.categories}>
            <div className={styles.sidebarTitle}>Categorias</div>
            {productCategories.length === 0 ? <span className={styles.categoryEmpty}>Sem categorias</span> : null}
            {productCategories.map((item) => (
              <button
                type="button"
                key={item.name}
                className={`${styles.categoryButton} ${selectedProductCategory === item.name ? styles.categoryActive : ''}`.trim()}
                onClick={() => setCategory(item.name)}
              >
                <span>{item.name}</span>
                <Badge>{item.count}</Badge>
              </button>
            ))}
          </aside>

          <section className={styles.content}>
            <ProductFilters
              query={query}
              onQueryChange={setQuery}
              category={selectedProductCategory}
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
              categories={productCategories}
            />

            <BulkProductToolbar
              selectedCount={selectedProducts.length}
              filteredCount={filteredProducts.length}
              saving={savingAction === 'bulk-availability' || savingAction === 'bulk-delivery'}
              onSelectFiltered={selectFilteredProducts}
              onClear={() => setSelectedProductIds([])}
              onActivate={() => void bulkAvailability(true)}
              onDeactivate={() => void bulkAvailability(false)}
              onShowDelivery={() => void bulkDeliveryVisibility(true)}
              onHideDelivery={() => void bulkDeliveryVisibility(false)}
            />

            {loading ? <LoadingState label="Carregando catalogo..." /> : null}
            {!loading && filteredProducts.length === 0 ? <EmptyState title="Nenhum produto encontrado" description="Ajuste os filtros ou cadastre um novo produto." /> : null}
            {!loading && filteredProducts.length > 0 ? (
              <Card className={styles.catalogProductsPanel}>
                <div className={styles.catalogCategoryHeader}>
                  <div>
                    <span>Categoria selecionada</span>
                    <strong>{selectedProductCategory || 'Produtos'}</strong>
                    <p>{filteredProducts.length} produto(s) nesta categoria. A lista sempre mostra apenas a categoria aberta.</p>
                  </div>
                  <div className={styles.catalogCategoryActions}>
                    <Button onClick={selectFilteredProducts} disabled={filteredProducts.length === 0}>Edicao em massa</Button>
                    <Button
                      onClick={() => selectedCategoryRecord?.id ? openCategoryModal(selectedCategoryRecord as AdminMenuCategory) : openCategoryModal()}
                    >
                      Editar categoria
                    </Button>
                  </div>
                </div>
                <div className={styles.catalogProductList}>
                  {filteredProducts.map((product) => {
                    const financials = productFinancials(product);
                    const selected = selectedProductIds.includes(product.id);
                    const initials = product.name
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 3)
                      .toUpperCase();
                    return (
                      <article
                        key={product.id}
                        className={`${styles.catalogProductRow} ${selected ? styles.catalogProductSelected : ''}`.trim()}
                      >
                        <input
                          className={styles.tableCheck}
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleProductSelection(product.id)}
                          aria-label={`Selecionar produto ${product.name}`}
                        />
                        <button
                          type="button"
                          className={styles.catalogProductPhoto}
                          onClick={() => setModal({ mode: 'edit', product })}
                          aria-label={`Editar produto ${product.name}`}
                        >
                          {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span>{initials || productCode(product).slice(0, 2)}</span>}
                        </button>
                        <div className={styles.catalogProductInfo}>
                          <button type="button" className={styles.catalogProductName} onClick={() => setModal({ mode: 'edit', product })}>
                            {product.name}
                          </button>
                          <p>{product.description || 'Produto sem descricao cadastrada.'}</p>
                          <div className={styles.catalogProductMeta}>
                            <span>{product.categoryName ?? 'Sem categoria'}</span>
                            <span>SKU {productCode(product)}</span>
                            <span>{productSector(product)}</span>
                          </div>
                        </div>
                        <div className={styles.catalogPriceBox}>
                          <span>Preco</span>
                          <strong>{brl(financials.price)}</strong>
                        </div>
                        <div className={styles.catalogPriceBox}>
                          <span>CMV</span>
                          <strong>{percent(financials.cmv)}</strong>
                        </div>
                        <Badge tone={product.available === false ? 'danger' : 'success'}>
                          {product.available === false ? 'Inativo' : 'Ativo'}
                        </Badge>
                        <div className={styles.catalogRowActions}>
                          <Button onClick={() => setModal({ mode: 'edit', product })}>Editar</Button>
                          <Button onClick={() => void toggleAvailability(product)} disabled={savingAction === `toggle-${product.id}`}>
                            {product.available === false ? 'Ativar' : 'Desativar'}
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </Card>
            ) : null}
          </section>
        </section>
      ) : null}

      {activeTab === 'categories' ? (
        <section className={styles.categoryManagementList}>
          {productCategories.length === 0 ? (
            <EmptyState title="Sem categorias" description="Crie a primeira categoria para organizar o catalogo." />
          ) : null}
          {productCategories.map((item, index, list) => (
            <Card key={item.name} className={styles.categoryManagementRow}>
              <div className={styles.categoryManagementInfo}>
                <strong>{item.name}</strong>
                <span>{item.count} produtos | ordem {item.sortOrder ?? 0}</span>
              </div>
              <Badge tone={item.active === false ? 'warning' : 'success'}>{item.active === false ? 'Inativa' : 'Ativa'}</Badge>
              {item.id ? (
                <div className={styles.managementActions}>
                  <Button onClick={() => openCategoryModal(item as AdminMenuCategory)}>Editar</Button>
                  <Button
                    onClick={() => void moveCategory(item as AdminMenuCategory, -1)}
                    disabled={index === 0 || savingAction === 'reorder-categories'}
                    aria-label={`Mover categoria ${item.name} para cima`}
                  >
                    Subir
                  </Button>
                  <Button
                    onClick={() => void moveCategory(item as AdminMenuCategory, 1)}
                    disabled={index === list.length - 1 || savingAction === 'reorder-categories'}
                    aria-label={`Mover categoria ${item.name} para baixo`}
                  >
                    Descer
                  </Button>
                  <Button
                    onClick={() => void removeCategory(item as AdminMenuCategory)}
                    disabled={savingAction === `delete-category-${item.id}` || savingAction === 'reorder-categories'}
                  >
                    {savingAction === `delete-category-${item.id}` ? 'Removendo...' : 'Remover'}
                  </Button>
                </div>
              ) : (
                <span>Categoria detectada em produtos antigos. Edite o produto para vincular a uma categoria real.</span>
              )}
            </Card>
          ))}
          <Card className={styles.categoryManagementRow}>
            <div className={styles.categoryManagementInfo}>
              <strong>Nova categoria</strong>
              <span>Organize produtos por grupos operacionais.</span>
            </div>
            <Button variant="primary" onClick={() => openCategoryModal()}>Criar categoria</Button>
          </Card>
        </section>
      ) : null}

      {activeTab === 'addons' ? (
        <AddonsManagementPanel
          companyId={companyId}
          branchId={branchId}
          products={products}
          onProductsChanged={setProducts}
          onError={setActionError}
          onNotice={setNotice}
        />
      ) : null}

      {activeTab === 'options' ? (
        <AddonOptionsPanel
          companyId={companyId}
          branchId={branchId}
          onError={setActionError}
          onNotice={setNotice}
        />
      ) : null}

      {activeTab === 'combos' ? (
        <CombosManagementPanel
          products={products}
          combos={combos}
          savingAction={savingAction}
          onSave={(payload, combo) => void saveCombo(payload, combo)}
          onDisable={(combo) => void disableCombo(combo)}
        />
      ) : null}

      {activeTab === 'featured' ? (
        <FeaturedProductsPanel products={featuredProducts} savingAction={savingAction} onMove={(id, direction) => void moveFeatured(id, direction)} onToggleFeatured={(product) => void toggleFeatured(product)} />
      ) : null}

      {activeTab === 'import' ? (
        <ImportProductsPanel importCsv={importCsv} onImportCsvChange={setImportCsv} importPreview={importPreview} savingAction={savingAction} onPreview={() => void previewImport()} onCommit={() => void commitImport()} />
      ) : null}

      {activeTab === 'recommendations' ? <RecommendationsPanel products={products} /> : null}

      {activeTab === 'availability' ? (
        <ProductIssuePanel
          title="Disponibilidade operacional"
          description="Produtos inativos, sem preco ou com restricao de estoque aparecem aqui para saneamento rapido."
          products={[...unavailableProducts, ...products.filter((product) => Number(product.salePrice ?? product.price ?? 0) <= 0)]}
          emptyTitle="Disponibilidade em ordem"
          emptyDescription="Nao ha produtos inativos ou sem preco no catalogo atual."
          actionLabel="Editar produto"
          onAction={(product) => setModal({ mode: 'edit', product })}
          secondaryActionLabel="Ativar"
          onSecondaryAction={(product) => void toggleAvailability(product)}
        />
      ) : null}

      {activeTab === 'media' ? (
        <ProductIssuePanel
          title="Fotos e midia"
          description="Produtos sem imagem reduzem conversao no cardapio online. Abra o produto para inserir a foto."
          products={productsWithoutImage}
          emptyTitle="Todos os produtos tem foto"
          emptyDescription="Nao ha pendencia de imagem nos produtos carregados."
          actionLabel="Adicionar foto"
          onAction={(product) => setModal({ mode: 'edit', product })}
        />
      ) : null}

      {activeTab === 'deliveryPublication' ? (
        <ProductIssuePanel
          title="Publicacao no delivery"
          description="Controle quais produtos aparecem no cardapio online sem alterar o PDV."
          products={hiddenDeliveryProducts}
          emptyTitle="Tudo publicado no delivery"
          emptyDescription="Nao ha produtos ocultos no canal delivery."
          actionLabel="Exibir no delivery"
          onAction={(product) => void updateDeliveryVisibilityForProducts([product], true)}
          secondaryActionLabel="Editar produto"
          onSecondaryAction={(product) => setModal({ mode: 'edit', product })}
        />
      ) : null}

      {activeTab === 'audit' ? (
        <MenuAuditPanel
          products={products}
          categories={productCategories}
          withoutImage={productsWithoutImage.length}
          withoutDescription={productsWithoutDescription.length}
          withoutTechnicalSheet={productsWithoutTechnicalSheet.length}
          hiddenDelivery={hiddenDeliveryProducts.length}
          onEdit={(product) => setModal({ mode: 'edit', product })}
        />
      ) : null}

      {modal ? (
        <ProductModal
          mode={modal.mode}
          product={modal.product}
          onClose={() => setModal(null)}
          onSave={(payload) => void saveProduct(payload, modal.product)}
          onDelete={modal.product ? () => void removeProduct(modal.product as MenuProduct) : undefined}
          onToggleAvailability={modal.product ? () => void toggleAvailability(modal.product as MenuProduct) : undefined}
          onDuplicate={modal.product ? () => void duplicateProduct(modal.product as MenuProduct) : undefined}
          onToggleFeatured={modal.product ? () => void toggleFeatured(modal.product as MenuProduct) : undefined}
          onOpenAddons={modal.product ? () => setModal({ mode: 'addons', product: modal.product }) : undefined}
          onOpenVariations={modal.product ? () => setModal({ mode: 'variations', product: modal.product }) : undefined}
          onOpenTechnicalSheet={modal.product ? () => openTechnicalSheet(modal.product as MenuProduct) : undefined}
          onOpenRecommendations={modal.product ? () => void openRecommendations(modal.product as MenuProduct) : undefined}
          onSaveRecommendations={(payload) => modal.product ? void saveRecommendations(modal.product, payload) : undefined}
          companyId={companyId}
          branchId={branchId}
          onProductChanged={upsertProduct}
          onError={(message) => setActionError(message)}
          onNotice={(message) => setNotice(message)}
          variationApi={{
            fetch: fetchAdminMenuProductVariations,
            create: createAdminMenuProductVariation,
            update: updateAdminMenuProductVariation,
            remove: deleteAdminMenuProductVariation,
          }}
          recommendationConfig={recommendationConfig}
          products={products}
          saving={savingAction === 'save' || savingAction === 'save-recommendations'}
          deleting={modal.product ? savingAction === `delete-${modal.product.id}` : false}
          actionLoading={savingAction}
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
              <label>
                Ordem de exibicao
                <Input value={categoryDraftSortOrder} onChange={(event) => setCategoryDraftSortOrder(event.target.value)} placeholder="0" inputMode="numeric" />
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

function BulkProductToolbar({
  selectedCount,
  filteredCount,
  saving,
  onSelectFiltered,
  onClear,
  onActivate,
  onDeactivate,
  onShowDelivery,
  onHideDelivery,
}: {
  selectedCount: number;
  filteredCount: number;
  saving: boolean;
  onSelectFiltered: () => void;
  onClear: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onShowDelivery: () => void;
  onHideDelivery: () => void;
}) {
  return (
    <Card className={styles.bulkToolbar}>
      <div>
        <span>Acao em massa</span>
        <strong>{selectedCount} selecionados</strong>
        <small>{filteredCount} produtos no filtro atual.</small>
      </div>
      <div className={styles.bulkActions}>
        <Button onClick={onSelectFiltered} disabled={filteredCount === 0 || saving}>Selecionar filtro</Button>
        <Button onClick={onClear} disabled={selectedCount === 0 || saving}>Limpar</Button>
        <Button onClick={onActivate} disabled={selectedCount === 0 || saving}>Ativar</Button>
        <Button onClick={onDeactivate} disabled={selectedCount === 0 || saving}>Inativar</Button>
        <Button onClick={onShowDelivery} disabled={selectedCount === 0 || saving}>Exibir delivery</Button>
        <Button onClick={onHideDelivery} disabled={selectedCount === 0 || saving}>Ocultar delivery</Button>
      </div>
    </Card>
  );
}

function ProductIssuePanel({
  title,
  description,
  products,
  emptyTitle,
  emptyDescription,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  title: string;
  description: string;
  products: MenuProduct[];
  emptyTitle: string;
  emptyDescription: string;
  actionLabel: string;
  onAction: (product: MenuProduct) => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: (product: MenuProduct) => void;
}) {
  const uniqueProducts = Array.from(new Map(products.map((product) => [product.id, product])).values());

  return (
    <section className={styles.issueWorkspace}>
      <Card className={styles.issueHero}>
        <div>
          <span>Gestao premium</span>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        <Badge tone={uniqueProducts.length ? 'warning' : 'success'}>{uniqueProducts.length} pendencias</Badge>
      </Card>
      {uniqueProducts.length === 0 ? <EmptyState title={emptyTitle} description={emptyDescription} /> : null}
      <section className={styles.issueGrid}>
        {uniqueProducts.map((product) => (
          <Card key={product.id} className={styles.issueCard}>
            <div className={styles.issueCardHeader}>
              <div>
                <strong>{product.name}</strong>
                <span>{product.categoryName ?? 'Sem categoria'} | SKU {product.sku ?? '-'}</span>
              </div>
              <Badge tone={product.available === false ? 'danger' : 'success'}>{product.available === false ? 'Inativo' : 'Ativo'}</Badge>
            </div>
            <div className={styles.issueFacts}>
              <span>Preco {brl(primaryPrice(product))}</span>
              <span>{product.imageUrl ? 'Com foto' : 'Sem foto'}</span>
              <span>{hasTechnicalSheet(product) ? 'Com ficha' : 'Sem ficha'}</span>
              <span>{product.channels?.delivery === false ? 'Oculto delivery' : 'Delivery ativo'}</span>
            </div>
            <div className={styles.managementActions}>
              <Button variant="primary" onClick={() => onAction(product)}>{actionLabel}</Button>
              {secondaryActionLabel && onSecondaryAction ? <Button onClick={() => onSecondaryAction(product)}>{secondaryActionLabel}</Button> : null}
            </div>
          </Card>
        ))}
      </section>
    </section>
  );
}

function MenuAuditPanel({
  products,
  categories,
  withoutImage,
  withoutDescription,
  withoutTechnicalSheet,
  hiddenDelivery,
  onEdit,
}: {
  products: MenuProduct[];
  categories: CategorySummary[];
  withoutImage: number;
  withoutDescription: number;
  withoutTechnicalSheet: number;
  hiddenDelivery: number;
  onEdit: (product: MenuProduct) => void;
}) {
  const criticalProducts = products.filter(
    (product) =>
      !product.imageUrl?.trim() ||
      !product.description?.trim() ||
      !hasTechnicalSheet(product) ||
      Number(product.salePrice ?? product.price ?? 0) <= 0,
  );

  return (
    <section className={styles.auditWorkspace}>
      <Card className={styles.issueHero}>
        <div>
          <span>Auditoria</span>
          <strong>Saude do catalogo</strong>
          <p>Conferencia rapida de publicacao, midia, ficha tecnica e dados comerciais.</p>
        </div>
        <Badge tone={criticalProducts.length ? 'warning' : 'success'}>{criticalProducts.length} itens para revisar</Badge>
      </Card>
      <section className={styles.auditCards}>
        <AuditMetric title="Produtos" value={products.length} />
        <AuditMetric title="Categorias ativas" value={categories.filter((item) => item.active !== false).length} />
        <AuditMetric title="Sem foto" value={withoutImage} />
        <AuditMetric title="Sem descricao" value={withoutDescription} />
        <AuditMetric title="Sem ficha" value={withoutTechnicalSheet} />
        <AuditMetric title="Ocultos delivery" value={hiddenDelivery} />
      </section>
      <Card className={styles.auditTable}>
        <div className={styles.categoryCardHeader}>
          <strong>Produtos com atencao</strong>
          <span>{criticalProducts.length} linhas</span>
        </div>
        {criticalProducts.length === 0 ? <EmptyState title="Catalogo sem alertas" description="Nenhum ponto critico detectado." /> : null}
        {criticalProducts.slice(0, 80).map((product) => (
          <button key={product.id} type="button" className={styles.auditRow} onClick={() => onEdit(product)}>
            <strong>{product.name}</strong>
            <span>{product.categoryName ?? 'Sem categoria'}</span>
            <span>{brl(primaryPrice(product))}</span>
            <span>{!product.imageUrl?.trim() ? 'Sem foto' : 'Com foto'}</span>
            <span>{!product.description?.trim() ? 'Sem descricao' : 'Descricao OK'}</span>
            <span>{hasTechnicalSheet(product) ? 'Ficha OK' : 'Sem ficha'}</span>
          </button>
        ))}
      </Card>
    </section>
  );
}

function AuditMetric({ title, value }: { title: string; value: number }) {
  return (
    <Card className={styles.metric}>
      <span>{title}</span>
      <strong>{value}</strong>
    </Card>
  );
}

function hasTechnicalSheet(product: MenuProduct) {
  if (product.controlsStock === false || product.stockAvailabilityStatus === 'not_controlled') return true;
  return product.stockAvailabilityStatus !== 'missing_recipe' && product.stockAvailabilityStatus !== 'recipe_without_stock_items';
}

function CombosManagementPanel({
  products,
  combos,
  savingAction,
  onSave,
  onDisable,
}: {
  products: MenuProduct[];
  combos: MenuCombo[];
  savingAction: string | null;
  onSave: (payload: AdminMenuComboPayload, combo?: MenuCombo) => void;
  onDisable: (combo: MenuCombo) => void;
}) {
  const availableProducts = products.filter((product) => product.type !== 'combo');
  const [editing, setEditing] = useState<MenuCombo | undefined>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0');
  const [active, setActive] = useState(true);
  const [items, setItems] = useState<Array<{ productId: string; quantity: string }>>([
    { productId: availableProducts[0]?.id ?? '', quantity: '1' },
  ]);

  const startEdit = (combo: MenuCombo) => {
    setEditing(combo);
    setName(combo.name);
    setDescription(combo.description ?? '');
    setPrice(String(combo.price ?? 0));
    setActive(combo.active !== false);
    setItems(
      combo.items.length > 0
        ? combo.items.map((item) => ({ productId: item.productId, quantity: String(item.quantity ?? 1) }))
        : [{ productId: availableProducts[0]?.id ?? '', quantity: '1' }],
    );
  };

  const reset = () => {
    setEditing(undefined);
    setName('');
    setDescription('');
    setPrice('0');
    setActive(true);
    setItems([{ productId: availableProducts[0]?.id ?? '', quantity: '1' }]);
  };

  const submit = () => {
    onSave(
      {
        name: name.trim(),
        description: description.trim() || null,
        price: Number(price || 0),
        active,
        items: items
          .filter((item) => item.productId)
          .map((item) => ({ productId: item.productId, quantity: Number(item.quantity || 1) })),
      },
      editing,
    );
    reset();
  };

  return (
    <section className={styles.comboWorkspace}>
      <Card className={styles.comboBuilder}>
        <div className={styles.categoryCardHeader}>
          <div>
            <strong>{editing ? 'Editar combo' : 'Novo combo / kit'}</strong>
            <span>Monte ofertas premium usando produtos existentes do catalogo.</span>
          </div>
          {editing ? <Button onClick={reset}>Novo combo</Button> : null}
        </div>
        <div className={styles.formGrid}>
          <label>
            Nome
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Combo familia" />
          </label>
          <label>
            Preco fechado
            <Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" />
          </label>
          <label className={styles.wide}>
            Descricao
            <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Resumo comercial do combo" />
          </label>
          <label>
            Status
            <Select value={active ? 'active' : 'inactive'} onChange={(event) => setActive(event.target.value === 'active')}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </Select>
          </label>
        </div>
        <div className={styles.comboItemsEditor}>
          {items.map((item, index) => (
            <div key={`${item.productId}-${index}`} className={styles.comboItemRow}>
              <Select
                value={item.productId}
                onChange={(event) => setItems((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, productId: event.target.value } : row))}
              >
                <option value="">Selecione o produto</option>
                {availableProducts.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </Select>
              <Input
                value={item.quantity}
                onChange={(event) => setItems((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row))}
                inputMode="decimal"
              />
              <Button onClick={() => setItems((prev) => prev.filter((_, rowIndex) => rowIndex !== index))} disabled={items.length <= 1}>Remover</Button>
            </div>
          ))}
          <Button onClick={() => setItems((prev) => [...prev, { productId: availableProducts[0]?.id ?? '', quantity: '1' }])}>Adicionar item</Button>
        </div>
        <Button variant="primary" onClick={submit} disabled={savingAction === 'save-combo' || (editing ? savingAction === `save-combo-${editing.id}` : false)}>
          {savingAction?.startsWith('save-combo') ? 'Salvando...' : editing ? 'Salvar combo' : 'Criar combo'}
        </Button>
      </Card>

      <section className={styles.simpleGrid}>
        {combos.length === 0 ? <EmptyState title="Nenhum combo cadastrado" description="Crie combos usando produtos ativos do cardapio." /> : null}
        {combos.map((combo) => (
          <Card key={combo.id} className={styles.managementCard}>
            <div className={styles.categoryCardHeader}>
              <strong>{combo.name}</strong>
              <Badge tone={combo.active ? 'success' : 'warning'}>{combo.active ? 'Ativo' : 'Inativo'}</Badge>
            </div>
            <span>{combo.description || 'Sem descricao'}</span>
            <strong>{brl(combo.price)}</strong>
            <div className={styles.comboItemsSummary}>
              {combo.items.map((item) => (
                <span key={`${combo.id}-${item.productId}`}>{item.quantity}x {item.productName ?? item.productId}</span>
              ))}
            </div>
            <div className={styles.managementActions}>
              <Button onClick={() => startEdit(combo)}>Editar</Button>
              <Button onClick={() => onDisable(combo)} disabled={!combo.active || savingAction === `delete-combo-${combo.id}`}>
                {savingAction === `delete-combo-${combo.id}` ? 'Desativando...' : 'Desativar'}
              </Button>
            </div>
          </Card>
        ))}
      </section>
    </section>
  );
}
