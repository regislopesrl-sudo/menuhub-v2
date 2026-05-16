'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  createStockCategory,
  createStockItem,
  createStockBatch,
  estimateStockConversion,
  listStockCategories,
  listStockItems,
  listStockBatches,
  listStockMovements,
  listStockBreakageAlerts,
  listStockProductAvailability,
  stockManualEntry,
  stockManualExit,
  stockRegisterLoss,
  updateProductStockControl,
  updateStockCategoryStatus,
  updateStockItem,
  updateStockItemStatus,
  applyBatchInventoryCount,
  applyInventoryCounts,
  type StockItem,
  type StockCategory,
  type StockBreakageAlert,
  type StockBatch,
  type StockItemType,
  type StockMovement,
  type StockProductAvailability,
  updateStockBatchStatus,
} from '@/features/stock/stock.api';
import styles from './page.module.css';

type StockTab = 'products' | 'addons' | 'ingredients';
type StockWorkspaceView = 'catalog' | 'movement' | 'batches' | 'analysis';
type StockStatusFilter = 'all' | 'low' | 'forecast' | 'batch' | 'negative';
type ProductPriorityKey = 'critical' | 'attention' | 'ok';
type ProductAvailabilityFilter =
  | 'action'
  | 'all'
  | 'available'
  | 'low_stock'
  | 'out_of_stock'
  | 'missing_recipe'
  | 'recipe_without_stock_items'
  | 'not_controlled';

const STOCK_TAB_ORDER: StockTab[] = ['products', 'addons', 'ingredients'];

const STOCK_TYPE_LABELS: Record<StockItemType, string> = {
  PRODUCT: 'Produto',
  RAW_MATERIAL: 'Insumo',
  ADDON: 'Adicional',
};

const STOCK_TAB_META: Record<StockTab, { label: string; description: string; emptyTitle: string; emptyDescription: string }> = {
  products: {
    label: 'PRODUTOS',
    description: 'Itens vendidos ou prontos para venda',
    emptyTitle: 'Sem produtos em estoque',
    emptyDescription: 'Cadastre o primeiro produto controlado no estoque.',
  },
  addons: {
    label: 'ADICIONAIS',
    description: 'Complementos vendidos com produtos',
    emptyTitle: 'Sem adicionais em estoque',
    emptyDescription: 'Cadastre o primeiro adicional controlado no estoque.',
  },
  ingredients: {
    label: 'INSUMOS',
    description: 'Materias-primas e itens internos',
    emptyTitle: 'Sem insumos em estoque',
    emptyDescription: 'Cadastre o primeiro insumo de estoque.',
  },
};

const PRODUCT_AVAILABILITY_LABELS: Record<StockProductAvailability['availabilityStatus'], string> = {
  available: 'Disponivel',
  low_stock: 'Baixo estoque',
  out_of_stock: 'Sem estoque',
  missing_recipe: 'Sem ficha',
  recipe_without_stock_items: 'Ficha sem insumos',
  not_controlled: 'Sem controle',
};

const PRODUCT_ATTENTION_STATUSES: StockProductAvailability['availabilityStatus'][] = [
  'low_stock',
  'out_of_stock',
  'missing_recipe',
  'recipe_without_stock_items',
];

const PRODUCT_AVAILABILITY_FILTERS: Array<{ key: ProductAvailabilityFilter; label: string }> = [
  { key: 'action', label: 'Acao necessaria' },
  { key: 'all', label: 'Todos' },
  { key: 'out_of_stock', label: 'Sem estoque' },
  { key: 'low_stock', label: 'Baixo estoque' },
  { key: 'missing_recipe', label: 'Sem ficha' },
  { key: 'recipe_without_stock_items', label: 'Ficha sem insumos' },
  { key: 'not_controlled', label: 'Sem controle' },
  { key: 'available', label: 'Disponiveis' },
];

function productMatchesAvailabilityFilter(product: StockProductAvailability, filter: ProductAvailabilityFilter) {
  if (filter === 'all') return true;
  if (filter === 'action') return PRODUCT_ATTENTION_STATUSES.includes(product.availabilityStatus);
  return product.availabilityStatus === filter;
}

function productSanityGuidance(product: StockProductAvailability) {
  if (product.availabilityStatus === 'out_of_stock') {
    const ingredient = product.limitingIngredients[0];
    return ingredient
      ? `Repor ou ajustar o insumo limitante: ${ingredient.name}.`
      : 'Revise saldo e ficha tecnica para liberar venda.';
  }
  if (product.availabilityStatus === 'low_stock') return 'Produto vendavel, mas precisa reposicao preventiva.';
  if (product.availabilityStatus === 'missing_recipe') return 'Criar ou vincular ficha tecnica para baixa automatica.';
  if (product.availabilityStatus === 'recipe_without_stock_items') return 'Adicionar insumos com baixa de estoque na ficha tecnica.';
  if (product.availabilityStatus === 'not_controlled') return 'Marque como controlado se este produto deve baixar estoque.';
  return 'Produto saneado para venda com controle tecnico.';
}

function getProductSanityPriority(product: StockProductAvailability) {
  if (product.availabilityStatus === 'out_of_stock') return { key: 'critical' as const, label: 'Critico', className: styles.priorityCritical };
  if (product.availabilityStatus === 'missing_recipe' || product.availabilityStatus === 'recipe_without_stock_items') {
    return { key: 'critical' as const, label: 'Critico', className: styles.priorityCritical };
  }
  if (product.availabilityStatus === 'low_stock' || product.availabilityStatus === 'not_controlled') {
    return { key: 'attention' as const, label: 'Atencao', className: styles.priorityWarning };
  }
  return { key: 'ok' as const, label: 'OK', className: styles.priorityOk };
}

function getProductAvailabilityClass(status: StockProductAvailability['availabilityStatus']) {
  if (status === 'available') return styles.statusAvailable;
  if (status === 'low_stock') return styles.statusWarning;
  if (status === 'out_of_stock' || status === 'missing_recipe' || status === 'recipe_without_stock_items') return styles.statusDanger;
  return styles.statusNeutral;
}

type UnitGroup = 'count' | 'mass' | 'volume' | 'length';

type UnitOption = {
  code: string;
  label: string;
  group: UnitGroup;
  baseFactor: number;
  hint: string;
};

const UNIT_GROUP_LABELS: Record<UnitGroup, string> = {
  count: 'Unidades comerciais',
  mass: 'Peso / massa',
  volume: 'Volume',
  length: 'Comprimento',
};

const STOCK_UNIT_OPTIONS: UnitOption[] = [
  { code: 'UN', label: 'UN - Unidade', group: 'count', baseFactor: 1, hint: '1 unidade' },
  { code: 'DZ', label: 'DZ - Duzia', group: 'count', baseFactor: 12, hint: '12 unidades' },
  { code: 'CX6', label: 'CX6 - Caixa com 6', group: 'count', baseFactor: 6, hint: '6 unidades' },
  { code: 'CX12', label: 'CX12 - Caixa com 12', group: 'count', baseFactor: 12, hint: '12 unidades' },
  { code: 'CX24', label: 'CX24 - Caixa com 24', group: 'count', baseFactor: 24, hint: '24 unidades' },
  { code: 'PCT10', label: 'PCT10 - Pacote com 10', group: 'count', baseFactor: 10, hint: '10 unidades' },
  { code: 'PCT20', label: 'PCT20 - Pacote com 20', group: 'count', baseFactor: 20, hint: '20 unidades' },
  { code: 'PCT50', label: 'PCT50 - Pacote com 50', group: 'count', baseFactor: 50, hint: '50 unidades' },
  { code: 'PCT100', label: 'PCT100 - Pacote com 100', group: 'count', baseFactor: 100, hint: '100 unidades' },
  { code: 'FD6', label: 'FD6 - Fardo com 6', group: 'count', baseFactor: 6, hint: '6 unidades' },
  { code: 'FD12', label: 'FD12 - Fardo com 12', group: 'count', baseFactor: 12, hint: '12 unidades' },
  { code: 'MG', label: 'MG - Miligrama', group: 'mass', baseFactor: 0.001, hint: '0,001 grama' },
  { code: 'G', label: 'G - Grama', group: 'mass', baseFactor: 1, hint: '1 grama' },
  { code: 'KG', label: 'KG - Quilograma', group: 'mass', baseFactor: 1000, hint: '1000 gramas' },
  { code: 'T', label: 'T - Tonelada', group: 'mass', baseFactor: 1000000, hint: '1000 kg' },
  { code: 'ML', label: 'ML - Mililitro', group: 'volume', baseFactor: 1, hint: '1 mililitro' },
  { code: 'L', label: 'L - Litro', group: 'volume', baseFactor: 1000, hint: '1000 mililitros' },
  { code: 'CM', label: 'CM - Centimetro', group: 'length', baseFactor: 1, hint: '1 centimetro' },
  { code: 'M', label: 'M - Metro', group: 'length', baseFactor: 100, hint: '100 centimetros' },
];

const STOCK_UNIT_BY_CODE = new Map(STOCK_UNIT_OPTIONS.map((unit) => [unit.code, unit]));

function getDefaultTypeForTab(tab: StockTab): StockItemType {
  if (tab === 'products') return 'PRODUCT';
  if (tab === 'addons') return 'ADDON';
  return 'RAW_MATERIAL';
}

function getTabForStockType(stockType: StockItemType): StockTab {
  if (stockType === 'PRODUCT') return 'products';
  if (stockType === 'ADDON') return 'addons';
  return 'ingredients';
}

function belongsToTab(item: Pick<StockItem, 'stockType'>, tab: StockTab) {
  return getTabForStockType(item.stockType) === tab;
}

const OUTFLOW_MOVEMENT_TYPES = new Set<StockMovement['movementType']>(['EXIT', 'LOSS', 'PRODUCTION_CONSUMPTION', 'SALE_CONSUMPTION']);

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function formatDecimal(value: number, digits = 2) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(Number(value || 0));
}

function formatCoverage(days: number | null) {
  if (days === null) return 'Sem consumo';
  if (!Number.isFinite(days)) return 'Sem consumo';
  if (days > 999) return '999+ dias';
  return `${formatDecimal(days, 1)} dias`;
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeUnitCode(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function getUnitOption(value: unknown) {
  return STOCK_UNIT_BY_CODE.get(normalizeUnitCode(value));
}

function getProgrammedConversionFactor(fromUnit: string, toUnit: string) {
  const from = getUnitOption(fromUnit);
  const to = getUnitOption(toUnit);
  if (!from || !to || from.group !== to.group) return null;
  return from.baseFactor / to.baseFactor;
}

function formatConversionFactor(value: number) {
  return Number(value.toFixed(6)).toString();
}

function UnitOptions({ value }: { value: string }) {
  const current = normalizeUnitCode(value);
  const known = STOCK_UNIT_BY_CODE.has(current);
  return (
    <>
      {!known && current ? <option value={current}>{current} - unidade atual</option> : null}
      {(Object.keys(UNIT_GROUP_LABELS) as UnitGroup[]).map((group) => (
        <optgroup key={group} label={UNIT_GROUP_LABELS[group]}>
          {STOCK_UNIT_OPTIONS.filter((unit) => unit.group === group).map((unit) => (
            <option key={unit.code} value={unit.code}>
              {unit.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

function Field({
  label,
  help,
  wide,
  children,
}: {
  label: string;
  help?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`${styles.field} ${wide ? styles.fieldWide : ''}`.trim()}>
      <span>{label}</span>
      {children}
      {help ? <small>{help}</small> : null}
    </label>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.formSection}>
      <div className={styles.sectionTitle}>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function AdminStockPage() {
  const [activeTab, setActiveTab] = useState<StockTab>('products');
  const [workspaceView, setWorkspaceView] = useState<StockWorkspaceView>('catalog');
  const [itemSearch, setItemSearch] = useState('');
  const [itemStatusFilter, setItemStatusFilter] = useState<StockStatusFilter>('all');
  const [productAvailabilityFilter, setProductAvailabilityFilter] = useState<ProductAvailabilityFilter>('action');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [stockCategories, setStockCategories] = useState<StockCategory[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [alerts, setAlerts] = useState<StockBreakageAlert[]>([]);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [productAvailability, setProductAvailability] = useState<StockProductAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [itemName, setItemName] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [itemCategoryId, setItemCategoryId] = useState('');
  const [itemStockType, setItemStockType] = useState<StockItemType>('PRODUCT');
  const [itemUnit, setItemUnit] = useState('UN');
  const [itemPurchaseUnit, setItemPurchaseUnit] = useState('UN');
  const [itemProductionUnit, setItemProductionUnit] = useState('UN');
  const [itemConversionFactor, setItemConversionFactor] = useState('1');
  const [itemCost, setItemCost] = useState('0');
  const [itemMinimum, setItemMinimum] = useState('0');
  const [itemReorder, setItemReorder] = useState('0');
  const [itemLeadTimeDays, setItemLeadTimeDays] = useState('0');
  const [itemControlsStock, setItemControlsStock] = useState(true);
  const [itemControlsBatch, setItemControlsBatch] = useState(false);
  const [itemControlsExpiry, setItemControlsExpiry] = useState(false);
  const [itemRequiresFefo, setItemRequiresFefo] = useState(false);
  const [itemPerishable, setItemPerishable] = useState(false);
  const [itemFractionable, setItemFractionable] = useState(false);
  const [itemCritical, setItemCritical] = useState(false);
  const [itemHighTurnover, setItemHighTurnover] = useState(false);
  const [itemAllowNegative, setItemAllowNegative] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categorySortOrder, setCategorySortOrder] = useState('0');

  const [selectedItemId, setSelectedItemId] = useState('');
  const [moveQty, setMoveQty] = useState('');
  const [moveCost, setMoveCost] = useState('0');
  const [moveReason, setMoveReason] = useState('manual');
  const [moveBatchId, setMoveBatchId] = useState('');
  const [countedQty, setCountedQty] = useState('');
  const [batchCountId, setBatchCountId] = useState('');
  const [batchCountQty, setBatchCountQty] = useState('');
  const [lossQty, setLossQty] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [batchExpiration, setBatchExpiration] = useState('');
  const [batchQty, setBatchQty] = useState('');
  const [convQty, setConvQty] = useState('1');
  const [convFrom, setConvFrom] = useState('UN');
  const [convTo, setConvTo] = useState('UN');
  const [convResult, setConvResult] = useState<string | null>(null);
  const [movementItemFilter, setMovementItemFilter] = useState('');
  const [movementBatchFilter, setMovementBatchFilter] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('');

  const productItems = useMemo(() => items.filter((item) => belongsToTab(item, 'products')), [items]);
  const addonItems = useMemo(() => items.filter((item) => belongsToTab(item, 'addons')), [items]);
  const ingredientItems = useMemo(() => items.filter((item) => belongsToTab(item, 'ingredients')), [items]);
  const productAvailabilitySummary = useMemo(() => productAvailability.reduce((acc, product) => {
    acc[product.availabilityStatus] = (acc[product.availabilityStatus] ?? 0) + 1;
    return acc;
  }, {} as Record<StockProductAvailability['availabilityStatus'], number>), [productAvailability]);
  const productAttentionCount = useMemo(
    () => productAvailability.filter((product) => PRODUCT_ATTENTION_STATUSES.includes(product.availabilityStatus)).length,
    [productAvailability],
  );
  const productPrioritySummary = useMemo(() => productAvailability.reduce((acc, product) => {
    const priority = getProductSanityPriority(product).key;
    acc[priority] += 1;
    return acc;
  }, { critical: 0, attention: 0, ok: 0 } satisfies Record<ProductPriorityKey, number>), [productAvailability]);
  const activeStockCategories = useMemo(() => stockCategories.filter((category) => category.isActive !== false), [stockCategories]);
  const visibleItems = useMemo(() => items.filter((item) => belongsToTab(item, activeTab)), [activeTab, items]);
  const visibleItemIds = useMemo(() => new Set(visibleItems.map((item) => item.id)), [visibleItems]);
  const alertsByTab = useMemo(() => {
    const itemTypes = new Map(items.map((item) => [item.id, item.stockType] as const));
    const grouped: Record<StockTab, StockBreakageAlert[]> = { products: [], addons: [], ingredients: [] };
    alerts.forEach((alert) => {
      const stockType = itemTypes.get(alert.stockItemId);
      if (!stockType) return;
      grouped[getTabForStockType(stockType)].push(alert);
    });
    return grouped;
  }, [alerts, items]);
  const totalBreakageAlerts = alertsByTab.products.length + alertsByTab.addons.length + alertsByTab.ingredients.length;
  const selected = useMemo(() => visibleItems.find((it) => it.id === selectedItemId) ?? null, [selectedItemId, visibleItems]);
  const activeTabMeta = STOCK_TAB_META[activeTab];
  const recentOutMovements = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    return movements.filter((movement) => {
      if (!OUTFLOW_MOVEMENT_TYPES.has(movement.movementType)) return false;
      const createdAt = new Date(movement.createdAt).getTime();
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    });
  }, [movements]);
  const stockInsights = useMemo(() => visibleItems.map((item) => {
    const current = Number(item.currentQuantity ?? 0);
    const committed = Number(item.committedQuantity ?? 0);
    const available = Number(item.availableQuantity ?? current - committed);
    const committedOrderCount = Number(item.committedOrderCount ?? 0);
    const minimum = Number(item.minimumQuantity ?? 0);
    const reorder = Number(item.reorderPoint ?? 0);
    const averageCost = Number(item.averageCost ?? 0);
    const consumption30d = recentOutMovements
      .filter((movement) => movement.stockItemId === item.id)
      .reduce((acc, movement) => acc + Math.abs(Number(movement.quantity ?? 0)), 0);
    const dailyConsumption = consumption30d > 0 ? consumption30d / 30 : 0;
    const leadTimeDays = Number(item.leadTimeDays ?? 0);
    const coverageDays = dailyConsumption > 0 ? available / dailyConsumption : null;
    const configuredTarget = Math.max(minimum, reorder);
    const coverageTarget = dailyConsumption > 0 ? dailyConsumption * Math.max(7, leadTimeDays + 7) : 0;
    const targetQuantity = Math.max(configuredTarget, coverageTarget);
    const suggestedQuantity = item.controlsStock === false ? 0 : Math.max(0, targetQuantity - available);
    const ruptureRisk = dailyConsumption > 0 ? Number(coverageDays) < Math.max(7, leadTimeDays || 0) : available <= configuredTarget;

    return {
      item,
      current,
      committed,
      available,
      committedOrderCount,
      minimum,
      reorder,
      averageCost,
      stockValue: current * averageCost,
      availableValue: available * averageCost,
      committedValue: committed * averageCost,
      consumption30d,
      dailyConsumption,
      coverageDays,
      targetQuantity,
      suggestedQuantity,
      suggestedValue: suggestedQuantity * averageCost,
      ruptureRisk,
    };
  }), [recentOutMovements, visibleItems]);
  const suggestedPurchases = useMemo(
    () => stockInsights
      .filter((insight) => insight.suggestedQuantity > 0 || insight.ruptureRisk)
      .sort((left, right) => right.suggestedValue - left.suggestedValue || Number(left.coverageDays ?? 9999) - Number(right.coverageDays ?? 9999))
      .slice(0, 12),
    [stockInsights],
  );
  const stockKpis = useMemo(() => {
    const totalValue = stockInsights.reduce((acc, insight) => acc + insight.stockValue, 0);
    const availableValue = stockInsights.reduce((acc, insight) => acc + insight.availableValue, 0);
    const committedValue = stockInsights.reduce((acc, insight) => acc + insight.committedValue, 0);
    const committedQuantity = stockInsights.reduce((acc, insight) => acc + insight.committed, 0);
    const committedItems = stockInsights.filter((insight) => insight.committed > 0).length;
    const belowMinimum = stockInsights.filter((insight) => insight.available <= insight.minimum).length;
    const consumption30d = stockInsights.reduce((acc, insight) => acc + insight.consumption30d * insight.averageCost, 0);
    const suggestedValue = stockInsights.reduce((acc, insight) => acc + insight.suggestedValue, 0);
    const ruptureForecast = stockInsights.filter((insight) => insight.ruptureRisk).length;
    const perishable = visibleItems.filter((item) => item.controlsExpiry || item.isPerishable).length;
    return { totalValue, availableValue, committedValue, committedQuantity, committedItems, belowMinimum, perishable, consumption30d, suggestedValue, ruptureForecast };
  }, [stockInsights, visibleItems]);

  const stockInsightMap = useMemo(() => new Map(stockInsights.map((insight) => [insight.item.id, insight] as const)), [stockInsights]);
  const selectedInsight = selected ? stockInsightMap.get(selected.id) ?? null : null;
  const filteredProductAvailability = useMemo(() => {
    const query = normalizeText(itemSearch);
    return productAvailability.filter((product) => {
      const matchesSearch = !query || normalizeText(`${product.name} ${product.sku ?? ''} ${product.category?.name ?? ''}`).includes(query);
      if (!matchesSearch) return false;
      return productMatchesAvailabilityFilter(product, productAvailabilityFilter);
    });
  }, [itemSearch, productAvailability, productAvailabilityFilter]);
  const programmedConversionFactor = useMemo(
    () => getProgrammedConversionFactor(itemPurchaseUnit, itemUnit),
    [itemPurchaseUnit, itemUnit],
  );
  const purchaseUnitOption = getUnitOption(itemPurchaseUnit);
  const stockUnitOption = getUnitOption(itemUnit);
  const conversionProgrammedMessage = programmedConversionFactor !== null
    ? `1 ${purchaseUnitOption?.label ?? itemPurchaseUnit} = ${formatConversionFactor(programmedConversionFactor)} ${stockUnitOption?.label ?? itemUnit}`
    : 'Conversao automatica indisponivel para grupos diferentes. Use unidades do mesmo grupo ou cadastre o item pela unidade base da ficha tecnica.';
  const filteredVisibleItems = useMemo(() => {
    const query = normalizeText(itemSearch);
    return visibleItems.filter((item) => {
      const insight = stockInsightMap.get(item.id);
      const matchesSearch = !query || normalizeText(`${item.name} ${item.code ?? ''} ${item.category?.name ?? ''} ${STOCK_TYPE_LABELS[item.stockType] ?? item.stockType}`).includes(query);
      if (!matchesSearch) return false;
      if (itemStatusFilter === 'low') return Number(insight?.available ?? item.availableQuantity ?? item.currentQuantity ?? 0) <= Number(insight?.minimum ?? item.minimumQuantity ?? 0);
      if (itemStatusFilter === 'forecast') return insight?.ruptureRisk === true;
      if (itemStatusFilter === 'batch') return item.controlsBatch || item.controlsExpiry || item.requiresFefo;
      if (itemStatusFilter === 'negative') return Number(insight?.available ?? item.availableQuantity ?? item.currentQuantity ?? 0) < 0;
      return true;
    });
  }, [itemSearch, itemStatusFilter, stockInsightMap, visibleItems]);

  const filteredMovements = useMemo(() => movements.filter((movement) => {
    if (!visibleItemIds.has(movement.stockItemId)) return false;
    if (movementItemFilter && movement.stockItemId !== movementItemFilter) return false;
    if (movementBatchFilter && movement.batchId !== movementBatchFilter) return false;
    if (movementTypeFilter && movement.movementType !== movementTypeFilter) return false;
    return true;
  }), [movements, movementBatchFilter, movementItemFilter, movementTypeFilter, visibleItemIds]);

  function resetItemForm() {
    setItemName('');
    setItemCode('');
    setItemCategoryId('');
    setItemStockType(getDefaultTypeForTab(activeTab));
    setItemUnit('UN');
    setItemPurchaseUnit('UN');
    setItemProductionUnit('UN');
    setItemConversionFactor('1');
    setItemCost('0');
    setItemMinimum('0');
    setItemReorder('0');
    setItemLeadTimeDays('0');
    setItemControlsStock(true);
    setItemControlsBatch(false);
    setItemControlsExpiry(false);
    setItemRequiresFefo(false);
    setItemPerishable(false);
    setItemFractionable(false);
    setItemCritical(false);
    setItemHighTurnover(false);
    setItemAllowNegative(false);
  }

  function fillItemForm(item: StockItem) {
    setItemName(item.name ?? '');
    setItemCode(item.code ?? '');
    setItemCategoryId(item.categoryId ?? '');
    setItemStockType(item.stockType ?? 'RAW_MATERIAL');
    setItemUnit(normalizeUnitCode(item.stockUnit ?? 'UN'));
    setItemPurchaseUnit(normalizeUnitCode(item.purchaseUnit ?? item.stockUnit ?? 'UN'));
    setItemProductionUnit(normalizeUnitCode(item.productionUnit ?? item.stockUnit ?? 'UN'));
    setItemConversionFactor(String(item.conversionFactor ?? 1));
    setItemCost(String(item.averageCost ?? 0));
    setItemMinimum(String(item.minimumQuantity ?? 0));
    setItemReorder(String(item.reorderPoint ?? 0));
    setItemLeadTimeDays(String(item.leadTimeDays ?? 0));
    setItemControlsStock(item.controlsStock !== false);
    setItemControlsBatch(item.controlsBatch === true);
    setItemControlsExpiry(item.controlsExpiry === true);
    setItemRequiresFefo(item.requiresFefo === true);
    setItemPerishable(item.isPerishable === true);
    setItemFractionable(item.isFractionable === true);
    setItemCritical(item.isCritical === true);
    setItemHighTurnover(item.isHighTurnover === true);
    setItemAllowNegative(item.allowNegativeStock === true);
  }

  function scrollToItemForm() {
    window.setTimeout(() => {
      document.getElementById('stock-item-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  function openItemForEdit(itemId: string, view: StockWorkspaceView = 'catalog') {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    setActiveTab(getTabForStockType(item.stockType));
    setWorkspaceView(view);
    setSelectedItemId(item.id);
    fillItemForm(item);
    scrollToItemForm();
  }

  function startNewItem() {
    setSelectedItemId('');
    setWorkspaceView('catalog');
    resetItemForm();
    scrollToItemForm();
  }

  function exportStockAnalysisCsv() {
    const rows = stockInsights.map((insight) => [
      STOCK_TAB_META[getTabForStockType(insight.item.stockType)].label,
      insight.item.name,
      insight.item.code ?? '',
      insight.current,
      insight.committed,
      insight.available,
      insight.item.stockUnit ?? 'un',
      insight.minimum,
      insight.reorder,
      insight.consumption30d,
      formatCoverage(insight.coverageDays),
      insight.suggestedQuantity,
      insight.suggestedValue.toFixed(2),
      insight.ruptureRisk ? 'sim' : 'nao',
    ]);
    const headers = ['Tipo', 'Item', 'Codigo', 'Saldo fisico', 'Comprometido', 'Disponivel', 'Unidade', 'Minimo', 'Reposicao', 'Consumo 30d', 'Cobertura', 'Compra sugerida', 'Valor sugerido', 'Ruptura prevista'];
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `estoque-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function buildItemPayload() {
    return {
      name: itemName.trim(),
      code: itemCode.trim() || undefined,
      categoryId: itemCategoryId || null,
      stockType: itemStockType,
      stockUnit: normalizeUnitCode(itemUnit) || 'UN',
      purchaseUnit: normalizeUnitCode(itemPurchaseUnit) || normalizeUnitCode(itemUnit) || 'UN',
      productionUnit: normalizeUnitCode(itemProductionUnit) || normalizeUnitCode(itemUnit) || 'UN',
      conversionFactor: Number(itemConversionFactor || '1'),
      averageCost: Number(itemCost || '0'),
      minimumQuantity: Number(itemMinimum || '0'),
      reorderPoint: Number(itemReorder || '0'),
      leadTimeDays: Number(itemLeadTimeDays || '0'),
      controlsStock: itemControlsStock,
      controlsBatch: itemControlsBatch,
      controlsExpiry: itemControlsExpiry,
      requiresFefo: itemRequiresFefo,
      isPerishable: itemPerishable,
      isFractionable: itemFractionable,
      isCritical: itemCritical,
      isHighTurnover: itemHighTurnover,
      allowNegativeStock: itemAllowNegative,
    };
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [stockItems, stockMovements, stockAlerts, categories, productStatuses] = await Promise.all([
        listStockItems(),
        listStockMovements(),
        listStockBreakageAlerts(),
        listStockCategories(true),
        listStockProductAvailability(),
      ]);
      setItems(stockItems);
      setMovements(stockMovements);
      setAlerts(stockAlerts);
      setStockCategories(categories);
      setProductAvailability(productStatuses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar estoque.');
    } finally {
      setLoading(false);
    }
  }

  async function refreshProductAvailability() {
    try {
      const productStatuses = await listStockProductAvailability();
      setProductAvailability(productStatuses);
    } catch {
      // A tela principal continua operando mesmo se a visao de produtos atrasar.
    }
  }

  async function toggleProductStockControl(product: StockProductAvailability) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const nextControlsStock = !product.controlsStock;
      await updateProductStockControl(product.productId, nextControlsStock);
      await refreshProductAvailability();
      setNotice(nextControlsStock ? 'Produto marcado para controlar estoque.' : 'Produto marcado como sem controle de estoque.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao alterar controle de estoque do produto.');
    } finally {
      setSaving(false);
    }
  }

  function toggleProductSelection(productId: string) {
    setSelectedProductIds((current) => (
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    ));
  }

  function selectFilteredProducts() {
    setSelectedProductIds(filteredProductAvailability.map((product) => product.productId));
  }

  function selectProductsByPriority(priority: ProductPriorityKey) {
    setSelectedProductIds(
      productAvailability
        .filter((product) => getProductSanityPriority(product).key === priority)
        .map((product) => product.productId),
    );
  }

  function selectProductsByStatus(status: StockProductAvailability['availabilityStatus']) {
    setSelectedProductIds(
      productAvailability
        .filter((product) => product.availabilityStatus === status)
        .map((product) => product.productId),
    );
  }

  function clearSelectedProducts() {
    setSelectedProductIds([]);
  }

  async function bulkUpdateProductStockControl(controlsStock: boolean) {
    const selectedProducts = productAvailability.filter((product) => selectedProductIds.includes(product.productId));
    if (selectedProducts.length === 0) {
      setError('Selecione ao menos um produto para executar a acao em massa.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await Promise.all(selectedProducts.map((product) => updateProductStockControl(product.productId, controlsStock)));
      setSelectedProductIds([]);
      await refreshProductAvailability();
      setNotice(
        controlsStock
          ? `${selectedProducts.length} produto(s) marcados para controlar estoque.`
          : `${selectedProducts.length} produto(s) marcados como sem controle de estoque.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao executar saneamento em massa.');
    } finally {
      setSaving(false);
    }
  }

  async function loadBatches(itemId: string) {
    if (!itemId) {
      setBatches([]);
      return;
    }
    try {
      const list = await listStockBatches(itemId);
      setBatches(list);
    } catch {
      setBatches([]);
    }
  }

  async function submitLoss() {
    if (!selectedItemId) {
      setError('Selecione um item.');
      return;
    }
    const qty = Number(lossQty || '0');
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Quantidade de perda invalida.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await stockRegisterLoss({
        stockItemId: selectedItemId,
        quantity: qty,
        unitCost: Number(moveCost || '0'),
        batchId: moveBatchId || undefined,
        reasonCode: 'breakage_manual',
      });
      setItems((prev) => prev.map((it) => (it.id === result.item.id ? { ...it, ...result.item } : it)));
      setMovements((prev) => [...(result.movements ?? [result.movement]), ...prev]);
      setLossQty('');
      setMoveBatchId('');
      setNotice('Perda/quebra registrada.');
      const refreshedAlerts = await listStockBreakageAlerts();
      setAlerts(refreshedAlerts);
      await refreshProductAvailability();
      await loadBatches(selectedItemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar perda.');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedItemId) return;
    void loadBatches(selectedItemId);
  }, [selectedItemId]);

  useEffect(() => {
    if (programmedConversionFactor === null) return;
    setItemConversionFactor(formatConversionFactor(programmedConversionFactor));
  }, [programmedConversionFactor]);

  useEffect(() => {
    const current = visibleItems.find((item) => item.id === selectedItemId);
    if (current) return;
    const next = visibleItems[0];
    setSelectedItemId(next?.id ?? '');
    if (next) {
      fillItemForm(next);
    } else {
      setBatches([]);
      resetItemForm();
    }
  }, [activeTab, items]);

  useEffect(() => {
    setMovementItemFilter('');
    setMovementBatchFilter('');
    setItemSearch('');
    setItemStatusFilter('all');
    setSelectedProductIds([]);
  }, [activeTab]);

  useEffect(() => {
    const availableIds = new Set(productAvailability.map((product) => product.productId));
    setSelectedProductIds((current) => current.filter((id) => availableIds.has(id)));
  }, [productAvailability]);

  async function onCreateItem(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await createStockItem({
        ...buildItemPayload(),
      });
      setItems((prev) => [created, ...prev]);
      setActiveTab(getTabForStockType(created.stockType));
      setSelectedItemId(created.id);
      setWorkspaceView('catalog');
      fillItemForm(created);
      await refreshProductAvailability();
      setNotice('Item de estoque criado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar item.');
    } finally {
      setSaving(false);
    }
  }

  async function onUpdateItem() {
    if (!selectedItemId) {
      setError('Selecione um item para editar.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateStockItem(selectedItemId, buildItemPayload());
      setItems((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      await refreshProductAvailability();
      setNotice('Item de estoque atualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar item.');
    } finally {
      setSaving(false);
    }
  }

  async function submitCategory() {
    const name = categoryName.trim();
    if (!name) {
      setError('Informe o nome da categoria de estoque.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createStockCategory({
        name,
        sortOrder: Number(categorySortOrder || '0'),
      });
      setStockCategories((prev) => [...prev, created].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)));
      setItemCategoryId(created.id);
      setCategoryName('');
      setCategorySortOrder('0');
      setNotice('Categoria de estoque criada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar categoria.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleSelectedItemStatus() {
    if (!selectedItemId || !selected) {
      setError('Selecione um item para alterar status.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const nextActive = selected.isActive === false;
      const updated = await updateStockItemStatus(selectedItemId, { isActive: nextActive });
      setItems((prev) => {
        if (nextActive) return prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item));
        return prev.filter((item) => item.id !== updated.id);
      });
      if (!nextActive) {
        setSelectedItemId('');
        resetItemForm();
      }
      await refreshProductAvailability();
      setNotice(nextActive ? 'Item reativado.' : 'Item desativado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao alterar status do item.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleCategoryStatus(category: StockCategory) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateStockCategoryStatus(category.id, { isActive: category.isActive === false });
      setStockCategories((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      if (updated.isActive === false && itemCategoryId === updated.id) setItemCategoryId('');
      setNotice(updated.isActive ? 'Categoria reativada.' : 'Categoria desativada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao alterar categoria.');
    } finally {
      setSaving(false);
    }
  }

  async function submitBatch() {
    if (!selectedItemId) return setError('Selecione um item.');
    const quantity = Number(batchQty || '0');
    if (!Number.isFinite(quantity) || quantity <= 0) return setError('Quantidade de lote invalida.');
    setSaving(true);
    setError(null);
    try {
      await createStockBatch(selectedItemId, {
        batchNumber: batchNumber || undefined,
        expirationDate: batchExpiration || undefined,
        initialQuantity: quantity,
        unitCost: Number(moveCost || '0') || undefined,
      });
      setBatchNumber('');
      setBatchExpiration('');
      setBatchQty('');
      await load();
      await loadBatches(selectedItemId);
      await refreshProductAvailability();
      setNotice('Lote registrado com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar lote.');
    } finally {
      setSaving(false);
    }
  }

  async function changeBatchStatus(batchId: string, status: 'AVAILABLE' | 'OPENED' | 'QUARANTINED' | 'DISCARDED' | 'EXPIRED') {
    if (!selectedItemId) return setError('Selecione um item.');
    const notes = status === 'QUARANTINED'
      ? 'Lote em quarentena operacional.'
      : status === 'DISCARDED'
        ? 'Lote descartado operacionalmente.'
        : status === 'EXPIRED'
          ? 'Lote expirado operacionalmente.'
          : undefined;
    setSaving(true);
    setError(null);
    try {
      await updateStockBatchStatus(selectedItemId, batchId, { status, notes });
      await load();
      await loadBatches(selectedItemId);
      await refreshProductAvailability();
      setNotice(`Status do lote atualizado para ${status}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar lote.');
    } finally {
      setSaving(false);
    }
  }

  async function runConversionEstimate() {
    if (!selectedItemId) return setError('Selecione um item.');
    setSaving(true);
    setError(null);
    try {
      const result = await estimateStockConversion({
        stockItemId: selectedItemId,
        quantity: Number(convQty || '0'),
        fromUnit: convFrom,
        toUnit: convTo,
      });
      setConvResult(`${result.inputQuantity} ${result.fromUnit} = ${result.convertedQuantity} ${result.toUnit}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao estimar conversao.');
      setConvResult(null);
    } finally {
      setSaving(false);
    }
  }

  async function submitMovement(type: 'entry' | 'exit') {
    if (!selectedItemId) {
      setError('Selecione um item.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        stockItemId: selectedItemId,
        quantity: Number(moveQty || '0'),
        unitCost: Number(moveCost || '0'),
        batchId: type === 'exit' ? moveBatchId || undefined : undefined,
        reasonCode: moveReason,
      };
      const result = type === 'entry' ? await stockManualEntry(payload) : await stockManualExit(payload);
      setItems((prev) => prev.map((it) => (it.id === result.item.id ? { ...it, ...result.item } : it)));
      setMovements((prev) => [...(result.movements ?? [result.movement]), ...prev]);
      setMoveQty('');
      if (type === 'exit') setMoveBatchId('');
      setNotice(type === 'entry' ? 'Entrada manual registrada.' : 'Saida manual registrada.');
      await refreshProductAvailability();
      if (type === 'exit') await loadBatches(selectedItemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar movimentacao.');
    } finally {
      setSaving(false);
    }
  }

  async function submitInventoryCount() {
    if (!selectedItemId) {
      setError('Selecione um item.');
      return;
    }
    const counted = Number(countedQty || '0');
    if (!Number.isFinite(counted) || counted < 0) {
      setError('Quantidade contada invalida.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await applyInventoryCounts({
        counts: [{ stockItemId: selectedItemId, countedQuantity: counted, reasonCode: 'inventory_count' }],
      });
      await load();
      await refreshProductAvailability();
      setNotice('Inventario aplicado com sucesso.');
      setCountedQty('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aplicar inventario.');
    } finally {
      setSaving(false);
    }
  }

  async function submitBatchInventoryCount() {
    if (!selectedItemId) {
      setError('Selecione um item.');
      return;
    }
    if (!batchCountId) {
      setError('Selecione um lote para inventario.');
      return;
    }
    const counted = Number(batchCountQty || '0');
    if (!Number.isFinite(counted) || counted < 0) {
      setError('Quantidade contada do lote invalida.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await applyBatchInventoryCount({
        stockItemId: selectedItemId,
        batchId: batchCountId,
        countedQuantity: counted,
        reasonCode: 'batch_inventory_count',
      });
      if (result.item) setItems((prev) => prev.map((item) => (item.id === result.item?.id ? { ...item, ...result.item } : item)));
      await loadBatches(selectedItemId);
      const stockMovements = await listStockMovements();
      setMovements(stockMovements);
      await refreshProductAvailability();
      setNotice('Inventario por lote aplicado com sucesso.');
      setBatchCountQty('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aplicar inventario por lote.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className={styles.page}><LoadingState label="Carregando estoque..." /></main>;

  return (
    <main className={styles.page}>
      <PageHeader
        title="Estoque"
        subtitle="Controle base de itens, cobertura, compra sugerida e movimentacoes"
        right={
          <div className={styles.headerActions}>
            <Button onClick={exportStockAnalysisCsv}>CSV analise</Button>
            <Button onClick={() => void load()}>Atualizar</Button>
          </div>
        }
      />

      <section className={styles.stockTabs} aria-label="Tipo de estoque">
        <button
          type="button"
          className={`${styles.stockTab} ${activeTab === 'products' ? styles.stockTabActive : ''}`.trim()}
          onClick={() => setActiveTab('products')}
        >
          <span>{STOCK_TAB_META.products.label}</span>
          <strong>{productItems.length}</strong>
          <small>{STOCK_TAB_META.products.description}</small>
        </button>
        <button
          type="button"
          className={`${styles.stockTab} ${activeTab === 'addons' ? styles.stockTabActive : ''}`.trim()}
          onClick={() => setActiveTab('addons')}
        >
          <span>{STOCK_TAB_META.addons.label}</span>
          <strong>{addonItems.length}</strong>
          <small>{STOCK_TAB_META.addons.description}</small>
        </button>
        <button
          type="button"
          className={`${styles.stockTab} ${activeTab === 'ingredients' ? styles.stockTabActive : ''}`.trim()}
          onClick={() => setActiveTab('ingredients')}
        >
          <span>{STOCK_TAB_META.ingredients.label}</span>
          <strong>{ingredientItems.length}</strong>
          <small>{STOCK_TAB_META.ingredients.description}</small>
        </button>
      </section>

      {error ? <Card className={styles.card}><Badge tone="danger">Erro</Badge><span>{error}</span></Card> : null}
      {notice ? <Card className={styles.card}><Badge tone="success">OK</Badge><span>{notice}</span></Card> : null}
      <section className={styles.kpiGrid}>
        <Card className={styles.kpiCard}>
          <span>Disponivel</span>
          <strong>{formatMoney(stockKpis.availableValue)}</strong>
          <small>Saldo livre para venda/producao</small>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Saldo fisico</span>
          <strong>{formatMoney(stockKpis.totalValue)}</strong>
          <small>Total contado no estoque</small>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Comprometido</span>
          <strong>{formatMoney(stockKpis.committedValue)}</strong>
          <small>{formatDecimal(stockKpis.committedQuantity, 3)} em {stockKpis.committedItems} itens</small>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Compra sugerida</span>
          <strong>{formatMoney(stockKpis.suggestedValue)}</strong>
          <small>Considera o saldo disponivel</small>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Ruptura prevista</span>
          <strong>{stockKpis.ruptureForecast}</strong>
          <small>Cobertura menor que o prazo seguro</small>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Disponivel abaixo do minimo</span>
          <strong>{stockKpis.belowMinimum}</strong>
          <small>Fisico menos pedidos abertos</small>
        </Card>
      </section>

      <Card className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Alertas de ruptura</h2>
            <p>Separados por tipo de item para facilitar a conferencia operacional.</p>
          </div>
          <Badge>{totalBreakageAlerts} alertas</Badge>
        </div>
        {totalBreakageAlerts === 0 ? <span>Sem alertas no momento.</span> : null}
        <div className={styles.alertGrid}>
          {STOCK_TAB_ORDER.map((tab) => (
            <section key={tab} className={styles.alertColumn}>
              <div className={styles.alertColumnHeader}>
                <span>{STOCK_TAB_META[tab].label}</span>
                <strong>{alertsByTab[tab].length}</strong>
              </div>
              <div className={styles.alertList}>
                {alertsByTab[tab].length === 0 ? <span className={styles.emptyMini}>Sem alertas</span> : null}
                {alertsByTab[tab].map((alert) => (
                  <button
                    key={`${alert.stockItemId}-${alert.batchId ?? alert.type}`}
                    className={`${styles.row} ${styles.clickableRow}`.trim()}
                    type="button"
                    onClick={() => openItemForEdit(alert.stockItemId)}
                  >
                    <strong>{alert.name}</strong>
                    <div className={styles.meta}>
                      <span>Tipo: {alert.type}</span>
                      <span>Severidade: {alert.severity}</span>
                      <span>Fisico: {formatDecimal(alert.currentQuantity, 3)}</span>
                      {alert.committedQuantity !== undefined ? <span>Comprometido: {formatDecimal(alert.committedQuantity, 3)}</span> : null}
                      {alert.availableQuantity !== undefined ? <span>Disponivel: {formatDecimal(alert.availableQuantity, 3)}</span> : null}
                      <span>Min: {alert.minimumQuantity}</span>
                      <span>Reposicao: {alert.reorderPoint}</span>
                      {alert.batchNumber ? <span>Lote: {alert.batchNumber}</span> : null}
                      {alert.expirationDate ? <span>Validade: {new Date(alert.expirationDate).toLocaleDateString('pt-BR')}</span> : null}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Card>

      <Card className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Compra sugerida e cobertura</h2>
            <p>Adaptado da auditoria V15: calcula consumo recente, cobertura em dias e quantidade sugerida.</p>
          </div>
          <Badge>{suggestedPurchases.length} itens</Badge>
        </div>
        <div className={styles.suggestionList}>
          {suggestedPurchases.length === 0 ? <span className={styles.emptyMini}>Sem compra sugerida para esta aba.</span> : null}
          {suggestedPurchases.map((insight) => (
            <button
              key={insight.item.id}
              className={`${styles.row} ${styles.clickableRow}`.trim()}
              type="button"
              onClick={() => openItemForEdit(insight.item.id, 'analysis')}
            >
              <strong>{insight.item.name}</strong>
              <div className={styles.meta}>
                <span>Fisico: {formatDecimal(insight.current, 3)} {insight.item.stockUnit ?? 'un'}</span>
                <span>Comprometido: {formatDecimal(insight.committed, 3)}</span>
                <span>Disponivel: {formatDecimal(insight.available, 3)}</span>
                <span>Consumo 30d: {formatDecimal(insight.consumption30d, 3)}</span>
                <span>Cobertura: {formatCoverage(insight.coverageDays)}</span>
                <span>Comprar: {formatDecimal(insight.suggestedQuantity, 3)} {insight.item.stockUnit ?? 'un'}</span>
                <span>Valor: {formatMoney(insight.suggestedValue)}</span>
                {insight.ruptureRisk ? <span>Ruptura prevista</span> : null}
              </div>
            </button>
          ))}
        </div>
      </Card>

      {activeTab === 'products' ? (
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2>Saneamento do cardapio e estoque</h2>
              <p>Revise produtos sem ficha, sem controle, sem insumos ou com saldo tecnico baixo antes que aparecam bloqueados no PDV e delivery.</p>
            </div>
            <Badge tone={productAttentionCount > 0 ? 'warning' : 'success'}>{productAttentionCount} acoes</Badge>
          </div>
          <div className={styles.productStatusStrip}>
            <span><strong>{productAvailabilitySummary.available ?? 0}</strong> disponiveis</span>
            <span><strong>{productAvailabilitySummary.low_stock ?? 0}</strong> baixo estoque</span>
            <span><strong>{productAvailabilitySummary.out_of_stock ?? 0}</strong> sem estoque</span>
            <span><strong>{productAvailabilitySummary.missing_recipe ?? 0}</strong> sem ficha</span>
            <span><strong>{productAvailabilitySummary.recipe_without_stock_items ?? 0}</strong> ficha sem insumos</span>
            <span><strong>{productAvailabilitySummary.not_controlled ?? 0}</strong> sem controle</span>
          </div>
          <div className={styles.productPrioritySummary}>
            <button type="button" className={styles.prioritySummaryCard} onClick={() => selectProductsByPriority('critical')}>
              <span className={`${styles.productPriorityBadge} ${styles.priorityCritical}`.trim()}>Critico</span>
              <strong>{productPrioritySummary.critical}</strong>
              <small>Sem estoque, sem ficha ou ficha sem insumos.</small>
            </button>
            <button type="button" className={styles.prioritySummaryCard} onClick={() => selectProductsByPriority('attention')}>
              <span className={`${styles.productPriorityBadge} ${styles.priorityWarning}`.trim()}>Atencao</span>
              <strong>{productPrioritySummary.attention}</strong>
              <small>Baixo estoque ou sem controle automatico.</small>
            </button>
            <button type="button" className={styles.prioritySummaryCard} onClick={() => selectProductsByPriority('ok')}>
              <span className={`${styles.productPriorityBadge} ${styles.priorityOk}`.trim()}>OK</span>
              <strong>{productPrioritySummary.ok}</strong>
              <small>Produtos saneados para venda.</small>
            </button>
          </div>
          <div className={styles.productSanityControls}>
            <Input
              placeholder="Buscar produto, SKU ou categoria"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
            />
            <div className={styles.productSanityFilters}>
              {PRODUCT_AVAILABILITY_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className={`${styles.productSanityFilter} ${productAvailabilityFilter === filter.key ? styles.productSanityFilterActive : ''}`.trim()}
                  onClick={() => setProductAvailabilityFilter(filter.key)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.bulkSanityBar}>
            <div>
              <strong>{selectedProductIds.length} selecionado(s)</strong>
              <span>Selecione produtos para aplicar saneamento operacional em massa.</span>
            </div>
            <div className={styles.bulkSanityActions}>
              <Button type="button" disabled={filteredProductAvailability.length === 0} onClick={selectFilteredProducts}>
                Selecionar filtrados
              </Button>
              <Button type="button" disabled={(productAvailabilitySummary.out_of_stock ?? 0) === 0} onClick={() => selectProductsByStatus('out_of_stock')}>
                Selecionar sem estoque
              </Button>
              <Button type="button" disabled={(productAvailabilitySummary.missing_recipe ?? 0) === 0} onClick={() => selectProductsByStatus('missing_recipe')}>
                Selecionar sem ficha
              </Button>
              <Button type="button" disabled={(productAvailabilitySummary.not_controlled ?? 0) === 0} onClick={() => selectProductsByStatus('not_controlled')}>
                Selecionar sem controle
              </Button>
              <Button type="button" disabled={selectedProductIds.length === 0} onClick={clearSelectedProducts}>
                Limpar selecao
              </Button>
              <Button type="button" disabled={saving || selectedProductIds.length === 0} onClick={() => void bulkUpdateProductStockControl(true)}>
                Controlar estoque
              </Button>
              <Button type="button" disabled={saving || selectedProductIds.length === 0} onClick={() => void bulkUpdateProductStockControl(false)}>
                Marcar sem controle
              </Button>
            </div>
          </div>
          <div className={styles.productAvailabilityGrid}>
            {filteredProductAvailability.length === 0 ? (
              <EmptyState title="Nenhum produto encontrado" description="Altere a busca ou o filtro para revisar outros produtos." />
            ) : null}
            {filteredProductAvailability.slice(0, 36).map((product) => {
              const priority = getProductSanityPriority(product);
              const isSelected = selectedProductIds.includes(product.productId);
              return (
              <article key={product.productId} className={`${styles.productAvailabilityCard} ${isSelected ? styles.productAvailabilityCardSelected : ''}`.trim()}>
                <div className={styles.productAvailabilityHeader}>
                  <label className={styles.productSelectBox}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleProductSelection(product.productId)}
                    />
                    <strong>{product.name}</strong>
                  </label>
                  <span className={`${styles.productStatusBadge} ${getProductAvailabilityClass(product.availabilityStatus)}`.trim()}>
                    {PRODUCT_AVAILABILITY_LABELS[product.availabilityStatus]}
                  </span>
                </div>
                <div className={styles.productPriorityLine}>
                  <span className={`${styles.productPriorityBadge} ${priority.className}`.trim()}>{priority.label}</span>
                  <span>{product.controlsStock ? 'Controle ativo' : 'Sem baixa automatica'}</span>
                </div>
                <div className={styles.productAvailabilityMetrics}>
                  <div>
                    <span>Pode vender</span>
                    <strong>{product.availableToSell === null ? '-' : formatDecimal(product.availableToSell, 0)}</strong>
                  </div>
                  <div>
                    <span>Custo tecnico</span>
                    <strong>{formatMoney(product.technicalCost)}</strong>
                  </div>
                  <div>
                    <span>Margem</span>
                    <strong>{product.grossMargin === null ? '-' : formatMoney(product.grossMargin)}</strong>
                  </div>
                </div>
                <div className={styles.productAvailabilityMeta}>
                  <span>{product.category?.name ?? 'Sem categoria'}</span>
                  <span>{product.recipe?.name ?? 'Sem ficha tecnica'}</span>
                </div>
                <p className={styles.productAvailabilityGuidance}>{productSanityGuidance(product)}</p>
                {product.limitingIngredients.length > 0 ? (
                  <div className={styles.limitingIngredients}>
                    {product.limitingIngredients.map((ingredient) => (
                      <span key={ingredient.stockItemId}>
                        {ingredient.name}: {formatDecimal(ingredient.availableQuantity, 3)} {ingredient.stockUnit ?? ''}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className={styles.productAvailabilityActions}>
                  <Link className={styles.linkButton} href={`/admin/menu/products/${product.productId}/ficha-tecnica`}>
                    Ficha tecnica
                  </Link>
                  <Button type="button" disabled={saving} onClick={() => void toggleProductStockControl(product)}>
                    {product.controlsStock ? 'Marcar sem controle' : 'Controlar estoque'}
                  </Button>
                </div>
              </article>
              );
            })}
          </div>
        </Card>
      ) : null}

      <section className={styles.stockWorkspace}>
        <Card className={`${styles.card} ${styles.stockListCard}`.trim()}>
          <div className={styles.cardHeader}>
            <div>
              <h2>{activeTabMeta.label}</h2>
              <p>Consulte, filtre e selecione um item antes de editar cadastro, movimentos ou lotes.</p>
            </div>
            <Badge>{filteredVisibleItems.length} de {visibleItems.length}</Badge>
          </div>

          <div className={styles.listToolbar}>
            <Input
              placeholder={`Buscar em ${activeTabMeta.label.toLowerCase()}`}
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
            />
            <select className={styles.select} value={itemStatusFilter} onChange={(e) => setItemStatusFilter(e.target.value as StockStatusFilter)}>
              <option value="all">Todos os status</option>
              <option value="low">Disponivel abaixo do minimo</option>
              <option value="forecast">Ruptura prevista</option>
              <option value="batch">Com lote/validade</option>
              <option value="negative">Disponivel negativo</option>
            </select>
            <Button type="button" onClick={startNewItem}>Novo {STOCK_TYPE_LABELS[getDefaultTypeForTab(activeTab)].toLowerCase()}</Button>
          </div>

          <div className={styles.itemRows}>
            {visibleItems.length === 0 ? (
              <EmptyState title={activeTabMeta.emptyTitle} description={activeTabMeta.emptyDescription} />
            ) : null}
            {visibleItems.length > 0 && filteredVisibleItems.length === 0 ? (
              <EmptyState title="Nenhum item encontrado" description="Altere a busca ou o filtro para ver outros cadastros." />
            ) : null}
            {filteredVisibleItems.map((item) => {
              const insight = stockInsightMap.get(item.id);
              return (
                <button
                  key={item.id}
                  className={`${styles.itemCardRow} ${styles.clickableRow} ${selectedItemId === item.id ? styles.selectedRow : ''}`.trim()}
                  type="button"
                  onClick={() => openItemForEdit(item.id)}
                >
                  <div className={styles.itemRowMain}>
                    <strong>{item.name}</strong>
                    <span>{STOCK_TYPE_LABELS[item.stockType] ?? item.stockType} - {item.category?.name ?? 'Sem categoria'}</span>
                    <span>Cod. {item.code ?? '-'}</span>
                  </div>
                  <div className={styles.itemRowMetrics}>
                    <div className={styles.itemMetric}>
                      <small>Fisico</small>
                      <strong>{formatDecimal(Number(item.currentQuantity ?? 0), 3)} {item.stockUnit ?? 'un'}</strong>
                    </div>
                    <div className={styles.itemMetric}>
                      <small>Comprometido</small>
                      <strong>{formatDecimal(insight?.committed ?? item.committedQuantity ?? 0, 3)}</strong>
                    </div>
                    <div className={styles.itemMetric}>
                      <small>Disponivel</small>
                      <strong>{formatDecimal(insight?.available ?? item.availableQuantity ?? item.currentQuantity ?? 0, 3)} {item.stockUnit ?? 'un'}</strong>
                    </div>
                    <div className={styles.itemMetric}>
                      <small>Cobertura</small>
                      <strong>{formatCoverage(insight?.coverageDays ?? null)}</strong>
                    </div>
                  </div>
                  <div className={styles.itemRowBadges}>
                    {(insight?.available ?? 0) <= 0 ? <span className={styles.badgeDanger}>Disponivel zerado</span> : null}
                    {(insight?.available ?? 0) > 0 && (insight?.available ?? 0) <= (insight?.minimum ?? 0) ? <span className={styles.badgeDanger}>Abaixo do minimo</span> : null}
                    {(insight?.committed ?? 0) > 0 ? <span className={styles.badgeWarn}>{formatDecimal(insight?.committed ?? 0, 3)} comprometido</span> : null}
                    {insight?.ruptureRisk ? <span className={styles.badgeWarn}>Ruptura prevista</span> : null}
                    {item.controlsBatch ? <span className={styles.badgeSoft}>Lote</span> : null}
                    {item.category?.name ? <span className={styles.badgeSoft}>{item.category.name}</span> : null}
                    {item.controlsExpiry ? <span className={styles.badgeSoft}>Validade</span> : null}
                    {item.requiresFefo ? <span className={styles.badgeSoft}>FEFO</span> : null}
                    {item.controlsStock === false ? <span className={styles.badgeSoft}>Sem baixa</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className={`${styles.card} ${styles.itemDetailCard}`.trim()} id="stock-item-form">
          <div className={styles.cardHeader}>
            <div>
              <h2>{selected ? selected.name : `Novo ${STOCK_TYPE_LABELS[getDefaultTypeForTab(activeTab)].toLowerCase()}`}</h2>
              <p>{selected ? 'Edite o cadastro, ajuste saldo, controle lotes e acompanhe a cobertura do item selecionado.' : 'Preencha os dados para criar um novo cadastro nesta aba.'}</p>
            </div>
            <Badge>{selected ? STOCK_TYPE_LABELS[selected.stockType] ?? 'Item' : 'Novo item'}</Badge>
          </div>

          <div className={styles.detailSummary}>
            <div>
              <span>Saldo fisico</span>
              <strong>{selectedInsight ? `${formatDecimal(selectedInsight.current, 3)} ${selected?.stockUnit ?? 'un'}` : '-'}</strong>
            </div>
            <div>
              <span>Comprometido</span>
              <strong>{selectedInsight ? `${formatDecimal(selectedInsight.committed, 3)} ${selected?.stockUnit ?? 'un'}` : '-'}</strong>
            </div>
            <div>
              <span>Disponivel</span>
              <strong>{selectedInsight ? `${formatDecimal(selectedInsight.available, 3)} ${selected?.stockUnit ?? 'un'}` : '-'}</strong>
            </div>
            <div>
              <span>Cobertura</span>
              <strong>{selectedInsight ? formatCoverage(selectedInsight.coverageDays) : '-'}</strong>
            </div>
          </div>

          <div className={styles.workspaceTabs} role="tablist" aria-label="Acoes do item de estoque">
            <button
              type="button"
              className={`${styles.workspaceTab} ${workspaceView === 'catalog' ? styles.workspaceTabActive : ''}`.trim()}
              onClick={() => setWorkspaceView('catalog')}
            >
              Cadastro
            </button>
            <button
              type="button"
              disabled={!selectedItemId}
              className={`${styles.workspaceTab} ${workspaceView === 'movement' ? styles.workspaceTabActive : ''}`.trim()}
              onClick={() => setWorkspaceView('movement')}
            >
              Movimento
            </button>
            <button
              type="button"
              disabled={!selectedItemId}
              className={`${styles.workspaceTab} ${workspaceView === 'batches' ? styles.workspaceTabActive : ''}`.trim()}
              onClick={() => setWorkspaceView('batches')}
            >
              Lotes
            </button>
            <button
              type="button"
              disabled={!selectedItemId}
              className={`${styles.workspaceTab} ${workspaceView === 'analysis' ? styles.workspaceTabActive : ''}`.trim()}
              onClick={() => setWorkspaceView('analysis')}
            >
              Analise
            </button>
          </div>

          {workspaceView === 'catalog' ? (
            <form onSubmit={(e) => void onCreateItem(e)} className={styles.itemForm}>
              <FormSection title="Identificacao" description="Campos usados para localizar o item nas telas de estoque e ficha tecnica.">
                <div className={styles.formGrid}>
                  <Field label="Nome do item" help="Exibido na lista, movimentos e ficha tecnica." wide>
                    <Input placeholder="Ex.: Abacaxi fruta" value={itemName} onChange={(e) => setItemName(e.target.value)} />
                  </Field>
                  <Field label="Codigo interno" help="Codigo proprio, SKU ou codigo fiscal.">
                    <Input placeholder="Ex.: 137299" value={itemCode} onChange={(e) => setItemCode(e.target.value)} />
                  </Field>
                  <Field label="Tipo de cadastro" help="Produto, adicional e insumo ficam em abas separadas.">
                    <select className={styles.select} value={itemStockType} onChange={(e) => setItemStockType(e.target.value as StockItemType)}>
                      <option value="PRODUCT">Produto</option>
                      <option value="ADDON">Adicional</option>
                      <option value="RAW_MATERIAL">Insumo</option>
                    </select>
                  </Field>
                  <Field label="Categoria de estoque" help="Agrupa o item sem misturar com categorias do cardapio.">
                    <select className={styles.select} value={itemCategoryId} onChange={(e) => setItemCategoryId(e.target.value)}>
                      <option value="">Sem categoria</option>
                      {activeStockCategories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Categorias de estoque" description="Crie grupos internos para organizar compras, inventario e alertas.">
                <div className={styles.formGrid}>
                  <Field label="Nova categoria" help="Ex.: Hortifruti, Bebidas, Embalagens.">
                    <Input placeholder="Nome da categoria" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
                  </Field>
                  <Field label="Ordem" help="Menor numero aparece primeiro.">
                    <Input placeholder="0" value={categorySortOrder} onChange={(e) => setCategorySortOrder(e.target.value)} />
                  </Field>
                  <div className={styles.buttonSlot}>
                    <Button type="button" disabled={saving} onClick={() => void submitCategory()}>
                      Criar categoria
                    </Button>
                  </div>
                </div>
                <div className={styles.categoryList}>
                  {stockCategories.length === 0 ? <span className={styles.emptyMini}>Sem categorias cadastradas.</span> : null}
                  {stockCategories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      className={`${styles.categoryChip} ${category.isActive === false ? styles.categoryChipInactive : ''}`.trim()}
                      onClick={() => setItemCategoryId(category.isActive === false ? '' : category.id)}
                      disabled={category.isActive === false}
                    >
                      <strong>{category.name}</strong>
                      <span>{category._count?.items ?? 0} itens</span>
                    </button>
                  ))}
                </div>
                {stockCategories.length > 0 ? (
                  <div className={styles.actions}>
                    {stockCategories.map((category) => (
                      <Button key={category.id} type="button" disabled={saving} onClick={() => void toggleCategoryStatus(category)}>
                        {category.isActive === false ? 'Reativar' : 'Desativar'} {category.name}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </FormSection>

              <FormSection title="Unidades e conversao" description="Define como o saldo, a compra e a ficha tecnica calculam quantidade.">
                <div className={styles.formGrid}>
                  <Field label="Unidade de estoque" help="Unidade usada no saldo atual.">
                    <select className={styles.select} value={itemUnit} onChange={(e) => setItemUnit(normalizeUnitCode(e.target.value))}>
                      <UnitOptions value={itemUnit} />
                    </select>
                  </Field>
                  <Field label="Unidade de compra" help="Unidade recebida em compras.">
                    <select className={styles.select} value={itemPurchaseUnit} onChange={(e) => setItemPurchaseUnit(normalizeUnitCode(e.target.value))}>
                      <UnitOptions value={itemPurchaseUnit} />
                    </select>
                  </Field>
                  <Field label="Unidade de producao" help="Unidade usada na ficha tecnica.">
                    <select className={styles.select} value={itemProductionUnit} onChange={(e) => setItemProductionUnit(normalizeUnitCode(e.target.value))}>
                      <UnitOptions value={itemProductionUnit} />
                    </select>
                  </Field>
                  <Field label="Fator de conversao" help="Calculado automaticamente pela unidade de compra x estoque.">
                    <Input placeholder="Ex.: 1" value={itemConversionFactor} readOnly />
                  </Field>
                </div>
                <div className={`${styles.conversionNote} ${programmedConversionFactor === null ? styles.conversionWarning : ''}`.trim()}>
                  <strong>{programmedConversionFactor === null ? 'Conversao nao automatica' : 'Conversao programada'}</strong>
                  <span>{conversionProgrammedMessage}</span>
                </div>
              </FormSection>

              <FormSection title="Custo e reposicao" description="Parametros usados para alertas, CMV, cobertura e valor em estoque.">
                <div className={styles.formGrid}>
                  <Field label="Custo medio" help="Custo unitario atual do item.">
                    <Input placeholder="0,00" value={itemCost} onChange={(e) => setItemCost(e.target.value)} />
                  </Field>
                  <Field label="Estoque minimo" help="Saldo minimo antes de alertar.">
                    <Input placeholder="0" value={itemMinimum} onChange={(e) => setItemMinimum(e.target.value)} />
                  </Field>
                  <Field label="Ponto de reposicao" help="Saldo para sugerir compra ou producao.">
                    <Input placeholder="0" value={itemReorder} onChange={(e) => setItemReorder(e.target.value)} />
                  </Field>
                  <Field label="Prazo de reposicao" help="Dias medios para repor o item.">
                    <Input placeholder="0" value={itemLeadTimeDays} onChange={(e) => setItemLeadTimeDays(e.target.value)} />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Controles operacionais" description="Marque como o item deve se comportar no estoque.">
                <div className={styles.checkGrid}>
                  <label className={styles.check}><input type="checkbox" checked={itemControlsStock} onChange={(e) => setItemControlsStock(e.target.checked)} /> <span>Controla estoque<small>Movimenta saldo.</small></span></label>
                  <label className={styles.check}><input type="checkbox" checked={itemControlsBatch} onChange={(e) => setItemControlsBatch(e.target.checked)} /> <span>Controla lote<small>Permite rastrear lotes.</small></span></label>
                  <label className={styles.check}><input type="checkbox" checked={itemControlsExpiry} onChange={(e) => setItemControlsExpiry(e.target.checked)} /> <span>Controla validade<small>Usa data de vencimento.</small></span></label>
                  <label className={styles.check}><input type="checkbox" checked={itemRequiresFefo} onChange={(e) => setItemRequiresFefo(e.target.checked)} /> <span>FEFO<small>Sai primeiro o que vence antes.</small></span></label>
                  <label className={styles.check}><input type="checkbox" checked={itemPerishable} onChange={(e) => setItemPerishable(e.target.checked)} /> <span>Perecivel<small>Entra em alertas de validade.</small></span></label>
                  <label className={styles.check}><input type="checkbox" checked={itemFractionable} onChange={(e) => setItemFractionable(e.target.checked)} /> <span>Fracionavel<small>Aceita quantidade decimal.</small></span></label>
                  <label className={styles.check}><input type="checkbox" checked={itemCritical} onChange={(e) => setItemCritical(e.target.checked)} /> <span>Critico<small>Prioridade em ruptura.</small></span></label>
                  <label className={styles.check}><input type="checkbox" checked={itemHighTurnover} onChange={(e) => setItemHighTurnover(e.target.checked)} /> <span>Alto giro<small>Item de consumo rapido.</small></span></label>
                  <label className={styles.check}><input type="checkbox" checked={itemAllowNegative} onChange={(e) => setItemAllowNegative(e.target.checked)} /> <span>Permite negativo<small>Autoriza saldo abaixo de zero.</small></span></label>
                </div>
              </FormSection>

              <div className={styles.formActions}>
                <Button type="submit" disabled={saving}>Criar novo</Button>
                <Button type="button" disabled={saving || !selectedItemId} onClick={() => void onUpdateItem()}>Salvar edicao</Button>
                <Button type="button" variant="danger" disabled={saving || !selectedItemId} onClick={() => void toggleSelectedItemStatus()}>Desativar item</Button>
                <Button type="button" onClick={startNewItem}>Limpar campos</Button>
              </div>
            </form>
          ) : null}

          {workspaceView === 'movement' ? (
            <div className={styles.workspacePanel}>
              <FormSection title="Movimento de saldo" description="Use entrada para compra/ajuste positivo e saida para consumo manual.">
                <div className={styles.formGrid}>
                  <Field label="Item selecionado" help="Clique em outro item na lista para alterar.">
                    <Input value={selected?.name ?? ''} readOnly />
                  </Field>
                  <Field label="Quantidade movimentada" help={`Quantidade em ${selected?.stockUnit ?? 'unidade de estoque'}.`}>
                    <Input placeholder="0" value={moveQty} onChange={(e) => setMoveQty(e.target.value)} />
                  </Field>
                  <Field label="Custo unitario" help="Usado na entrada e no custo da perda.">
                    <Input placeholder="0,00" value={moveCost} onChange={(e) => setMoveCost(e.target.value)} />
                  </Field>
                  <Field label="Motivo" help="Identifica a origem da movimentacao.">
                    <Input placeholder="manual" value={moveReason} onChange={(e) => setMoveReason(e.target.value)} />
                  </Field>
                  <Field label="Lote para saida" help="Deixe em FEFO para escolher automaticamente o lote mais proximo do vencimento." wide>
                    <select className={styles.select} value={moveBatchId} onChange={(e) => setMoveBatchId(e.target.value)}>
                      <option value="">FEFO automatico</option>
                      {batches
                        .filter((batch) => Number(batch.quantityRemaining) > 0 && ['AVAILABLE', 'OPENED'].includes(batch.status))
                        .map((batch) => (
                          <option key={batch.id} value={batch.id}>
                            {batch.batchNumber ?? batch.id} - saldo {Number(batch.quantityRemaining).toFixed(3)}
                            {batch.expirationDate ? ` - ${new Date(batch.expirationDate).toLocaleDateString('pt-BR')}` : ''}
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>
                <div className={styles.formActions}>
                  <Button disabled={saving || !selectedItemId} onClick={() => void submitMovement('entry')}>Registrar entrada</Button>
                  <Button variant="danger" disabled={saving || !selectedItemId} onClick={() => void submitMovement('exit')}>Registrar saida</Button>
                </div>
              </FormSection>

              <FormSection title="Inventario e perdas" description="Ajuste o saldo contado ou registre quebra sem passar por compra/venda.">
                <div className={styles.formGrid}>
                  <Field label="Quantidade contada" help="Saldo fisico total contado no estoque.">
                    <Input placeholder="0" value={countedQty} onChange={(e) => setCountedQty(e.target.value)} />
                  </Field>
                  <div className={styles.buttonSlot}>
                    <Button disabled={saving || !selectedItemId} onClick={() => void submitInventoryCount()}>
                      Aplicar inventario
                    </Button>
                  </div>
                  <Field label="Lote contado" help="Use quando o item controla lote.">
                    <select className={styles.select} value={batchCountId} onChange={(e) => setBatchCountId(e.target.value)}>
                      <option value="">Selecionar lote</option>
                      {batches.map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          {batch.batchNumber ?? batch.id} - saldo {Number(batch.quantityRemaining).toFixed(3)} - {batch.status}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Quantidade contada no lote" help="Saldo fisico do lote selecionado.">
                    <Input placeholder="0" value={batchCountQty} onChange={(e) => setBatchCountQty(e.target.value)} />
                  </Field>
                  <div className={styles.buttonSlot}>
                    <Button disabled={saving || !selectedItemId || !batchCountId} onClick={() => void submitBatchInventoryCount()}>
                      Inventario por lote
                    </Button>
                  </div>
                  <Field label="Quantidade de perda/quebra" help="Baixa por perda operacional.">
                    <Input placeholder="0" value={lossQty} onChange={(e) => setLossQty(e.target.value)} />
                  </Field>
                  <div className={styles.buttonSlot}>
                    <Button variant="danger" disabled={saving || !selectedItemId} onClick={() => void submitLoss()}>
                      Registrar perda/quebra
                    </Button>
                  </div>
                </div>
              </FormSection>

              <div className={styles.cardHeader}>
                <div>
                  <h2>Ultimas movimentacoes</h2>
                  <p>Historico filtrado pelo tipo de item ativo.</p>
                </div>
              </div>
              <div className={styles.filterRow}>
                <select className={styles.select} value={movementItemFilter} onChange={(e) => setMovementItemFilter(e.target.value)}>
                  <option value="">Todos os itens</option>
                  {visibleItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <select className={styles.select} value={movementBatchFilter} onChange={(e) => setMovementBatchFilter(e.target.value)}>
                  <option value="">Todos os lotes</option>
                  {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.batchNumber ?? batch.id}</option>)}
                </select>
                <select className={styles.select} value={movementTypeFilter} onChange={(e) => setMovementTypeFilter(e.target.value)}>
                  <option value="">Todos os tipos</option>
                  <option value="ENTRY">Entrada</option>
                  <option value="EXIT">Saida</option>
                  <option value="ADJUSTMENT">Ajuste</option>
                  <option value="LOSS">Perda</option>
                  <option value="SALE_CONSUMPTION">Venda</option>
                </select>
              </div>
              <div className={styles.movementsList}>
                {filteredMovements.length === 0 ? <EmptyState title="Sem movimentacoes" /> : null}
                {filteredMovements.map((mv) => (
                  <button key={mv.id} className={`${styles.row} ${styles.clickableRow}`.trim()} type="button" onClick={() => openItemForEdit(mv.stockItemId, 'movement')}>
                    <strong>{mv.movementTypeDetailed ?? mv.movementType}</strong>
                    <div className={styles.meta}>
                      <span>Item: {mv.stockItemId}</span>
                      <span>Qtd: {Number(mv.quantity).toFixed(3)}</span>
                      {mv.batchId ? <span>Lote: {mv.batch?.batchNumber ?? mv.batchId}</span> : null}
                      {mv.batch?.expirationDate ? <span>Validade: {new Date(mv.batch.expirationDate).toLocaleDateString('pt-BR')}</span> : null}
                      <span>Anterior: {mv.previousStock ?? '-'}</span>
                      <span>Novo: {mv.newStock ?? '-'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {workspaceView === 'batches' ? (
            <div className={styles.workspacePanel}>
              <FormSection title="Novo lote" description="Preencha os dados do lote recebido para controlar saldo e vencimento.">
                <div className={styles.formGrid}>
                  <Field label="Numero do lote" help="Identificacao impressa na embalagem ou nota.">
                    <Input placeholder="Ex.: L2026-05" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
                  </Field>
                  <Field label="Validade" help="Formato: YYYY-MM-DD.">
                    <Input placeholder="2026-05-30" value={batchExpiration} onChange={(e) => setBatchExpiration(e.target.value)} />
                  </Field>
                  <Field label="Quantidade inicial" help={`Quantidade em ${selected?.stockUnit ?? 'unidade de estoque'}.`}>
                    <Input placeholder="0" value={batchQty} onChange={(e) => setBatchQty(e.target.value)} />
                  </Field>
                  <div className={styles.buttonSlot}>
                    <Button disabled={saving || !selectedItemId} onClick={() => void submitBatch()}>
                      Registrar lote
                    </Button>
                  </div>
                </div>
              </FormSection>

              <div className={styles.cardHeader}>
                <div>
                  <h2>Lotes do item</h2>
                  <p>Controle status, validade e saldo por lote.</p>
                </div>
                <Badge>{batches.length} lotes</Badge>
              </div>
              <div className={styles.itemsList}>
                {batches.length === 0 ? <EmptyState title="Sem lotes" description="Cadastre o primeiro lote do item." /> : null}
                {batches.map((batch) => (
                  <div key={batch.id} className={styles.row}>
                    <strong>Lote {batch.batchNumber ?? '-'}</strong>
                    <div className={styles.meta}>
                      <span>Validade: {batch.expirationDate ? new Date(batch.expirationDate).toLocaleDateString('pt-BR') : '-'}</span>
                      <span>Inicial: {Number(batch.initialQuantity).toFixed(3)}</span>
                      <span>Saldo: {Number(batch.quantityRemaining).toFixed(3)}</span>
                      <span>Status: {batch.status}</span>
                    </div>
                    <div className={styles.actions}>
                      <Button disabled={saving || batch.status === 'QUARANTINED'} onClick={() => void changeBatchStatus(batch.id, 'QUARANTINED')}>
                        Quarentena
                      </Button>
                      <Button disabled={saving || Number(batch.quantityRemaining) <= 0} variant="danger" onClick={() => void changeBatchStatus(batch.id, 'DISCARDED')}>
                        Descartar saldo
                      </Button>
                      <Button disabled={saving || Number(batch.quantityRemaining) <= 0} variant="danger" onClick={() => void changeBatchStatus(batch.id, 'EXPIRED')}>
                        Expirar
                      </Button>
                      <Button disabled={saving || Number(batch.quantityRemaining) <= 0} onClick={() => void changeBatchStatus(batch.id, 'AVAILABLE')}>
                        Reativar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {workspaceView === 'analysis' ? (
            <div className={styles.workspacePanel}>
              <div className={styles.analysisGrid}>
                <div className={styles.analysisCard}>
                  <span>Valor disponivel</span>
                  <strong>{selectedInsight ? formatMoney(selectedInsight.availableValue) : '-'}</strong>
                  <small>Disponivel multiplicado pelo custo medio.</small>
                </div>
                <div className={styles.analysisCard}>
                  <span>Comprometido</span>
                  <strong>{selectedInsight ? `${formatDecimal(selectedInsight.committed, 3)} ${selected?.stockUnit ?? 'un'}` : '-'}</strong>
                  <small>{selectedInsight ? `${selectedInsight.committedOrderCount} pedido(s) em aberto.` : 'Pedidos ainda sem baixa real.'}</small>
                </div>
                <div className={styles.analysisCard}>
                  <span>Compra sugerida</span>
                  <strong>{selectedInsight ? `${formatDecimal(selectedInsight.suggestedQuantity, 3)} ${selected?.stockUnit ?? 'un'}` : '-'}</strong>
                  <small>Baseada no disponivel, minimo, reposicao, consumo e prazo.</small>
                </div>
                <div className={styles.analysisCard}>
                  <span>Status</span>
                  <strong>{selectedInsight?.ruptureRisk ? 'Atencao' : 'Estavel'}</strong>
                  <small>{selectedInsight?.ruptureRisk ? 'Pode entrar em ruptura pela cobertura atual.' : 'Sem alerta critico para este item.'}</small>
                </div>
              </div>

              <FormSection title="Conversao de unidade" description="Simule a conversao entre unidade de compra, estoque e producao.">
                <div className={styles.formGrid}>
                  <Field label="Quantidade" help="Valor que deseja converter.">
                    <Input placeholder="1" value={convQty} onChange={(e) => setConvQty(e.target.value)} />
                  </Field>
                  <Field label="De unidade" help="Unidade de origem.">
                    <select className={styles.select} value={convFrom} onChange={(e) => setConvFrom(normalizeUnitCode(e.target.value))}>
                      <UnitOptions value={convFrom} />
                    </select>
                  </Field>
                  <Field label="Para unidade" help="Unidade de destino.">
                    <select className={styles.select} value={convTo} onChange={(e) => setConvTo(normalizeUnitCode(e.target.value))}>
                      <UnitOptions value={convTo} />
                    </select>
                  </Field>
                  <div className={styles.buttonSlot}>
                    <Button disabled={saving || !selectedItemId} onClick={() => void runConversionEstimate()}>
                      Estimar
                    </Button>
                  </div>
                </div>
                {convResult ? <Badge tone="success">{convResult}</Badge> : null}
              </FormSection>
            </div>
          ) : null}
        </Card>
      </section>
    </main>
  );
}
