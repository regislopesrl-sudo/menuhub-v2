'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  applyRecipeSubstitution,
  cancelProductionOrder,
  createProductionOrder,
  finishProductionOrder,
  listProductionStockItems,
  listProductionLosses,
  listProductMargins,
  registerProductionLoss,
  listProductionOrders,
  previewRecipeSubstitution,
  type RecipeSubstitutionPreview,
  type StockItemOption,
  startProductionOrder,
  type ProductionLossEvent,
  type ProductMarginResponse,
  type ProductionOrder,
} from '@/features/production/production.api';
import {
  createRecipe,
  listRecipes,
  replaceRecipeItems,
  updateRecipe,
  type Recipe,
  type RecipeItemPayload,
} from '@/features/recipes/recipes.api';
import styles from './page.module.css';

type FormState = {
  stockItemId: string;
  recipeId: string;
  plannedQuantity: string;
};

const INITIAL_FORM: FormState = {
  stockItemId: '',
  recipeId: '',
  plannedQuantity: '',
};

type SubstitutionForm = {
  recipeId: string;
  fromStockItemId: string;
  toStockItemId: string;
  quantityRatio: string;
  reason: string;
};

const INITIAL_SUBSTITUTION: SubstitutionForm = {
  recipeId: '',
  fromStockItemId: '',
  toStockItemId: '',
  quantityRatio: '1',
  reason: '',
};

type RecipeFormItem = {
  stockItemId: string;
  quantity: string;
  unit: string;
  optional: boolean;
  affectsStock: boolean;
  affectsCost: boolean;
};

type RecipeFormState = {
  name: string;
  yieldQuantity: string;
  yieldUnit: string;
  lossPercent: string;
  preparationSummary: string;
  notes: string;
  active: boolean;
  items: RecipeFormItem[];
};

const UNIT_OPTIONS = ['kg', 'g', 'L', 'ml', 'un', 'cx', 'fd', 'pct', 'sc', 'dz'];

function emptyRecipeItem(): RecipeFormItem {
  return {
    stockItemId: '',
    quantity: '',
    unit: 'un',
    optional: false,
    affectsStock: true,
    affectsCost: true,
  };
}

const INITIAL_RECIPE_FORM: RecipeFormState = {
  name: '',
  yieldQuantity: '1',
  yieldUnit: 'un',
  lossPercent: '0',
  preparationSummary: '',
  notes: '',
  active: true,
  items: [emptyRecipeItem()],
};

const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

function formatMoney(value: number | null | undefined) {
  return moneyFormatter.format(Number(value ?? 0));
}

function formatNumber(value: number | null | undefined) {
  return numberFormatter.format(Number(value ?? 0));
}

function formatYieldPercent(recipe: Recipe) {
  const value = Number(recipe.yieldQuantity ?? 0);
  if (!Number.isFinite(value) || value <= 0) {
    return '-';
  }

  const percent = value <= 1 ? value * 100 : value;
  return `${formatNumber(percent)}%`;
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isProductionOutputItem(item: StockItemOption) {
  const categoryName = normalizeText(item.category?.name);
  const notes = normalizeText(item.notes);
  return item.id.startsWith('sg-subproduto-') || categoryName === 'subprodutos' || notes.includes('subproduto importado');
}

function productionIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M4 21h16" />
      <path d="M7 21V9" />
      <path d="M17 21V9" />
      <path d="M7 9h10" />
      <path d="M9 9V5a3 3 0 0 1 6 0v4" />
      <path d="M10 14h4" />
    </svg>
  );
}

function recipeIngredientNames(recipe: Recipe) {
  return recipe.items
    .map((item) => item.stockItemName)
    .filter(Boolean)
    .join(', ');
}

function normalizeUnit(value: string | null | undefined) {
  const unit = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const aliases: Record<string, string> = {
    quilo: 'kg',
    kilos: 'kg',
    quilograma: 'kg',
    quilogramas: 'kg',
    grama: 'g',
    gramas: 'g',
    litro: 'l',
    litros: 'l',
    unidade: 'un',
    unidades: 'un',
    und: 'un',
    duzia: 'dz',
    duzias: 'dz',
  };
  return aliases[unit] ?? unit;
}

function convertBasicUnit(quantity: number, fromUnit: string, toUnit: string) {
  const mass: Record<string, number> = { mg: 0.001, g: 1, kg: 1000, t: 1000000 };
  const volume: Record<string, number> = { ml: 1, l: 1000 };
  const count: Record<string, number> = { un: 1, dz: 12 };
  for (const group of [mass, volume, count]) {
    if (group[fromUnit] && group[toUnit]) return (quantity * group[fromUnit]) / group[toUnit];
  }
  return null;
}

function quantityInStockUnit(quantity: number, unit: string, stockItem?: StockItemOption) {
  const fromUnit = normalizeUnit(unit);
  const stockUnit = normalizeUnit(stockItem?.stockUnit ?? stockItem?.productionUnit ?? stockItem?.purchaseUnit);
  if (!fromUnit || !stockUnit || fromUnit === stockUnit) return quantity;

  const converted = convertBasicUnit(quantity, fromUnit, stockUnit);
  if (converted !== null) return converted;

  const purchaseUnit = normalizeUnit(stockItem?.purchaseUnit);
  const conversionFactor = Number(stockItem?.conversionFactor ?? 1);
  if (purchaseUnit && fromUnit === purchaseUnit && Number.isFinite(conversionFactor) && conversionFactor > 0) {
    return quantity * conversionFactor;
  }

  return quantity;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PLANNED: 'Planejada',
    IN_PROGRESS: 'Em preparo',
    FINISHED: 'Finalizada',
    CANCELED: 'Cancelada',
  };
  return labels[status] ?? status;
}

function recipeItemCost(item: RecipeFormItem, stockItemById: Map<string, StockItemOption>) {
  const quantity = Number(item.quantity || 0);
  const stockItem = stockItemById.get(item.stockItemId);
  const unitCost = Number(stockItem?.averageCost ?? 0);
  const stockQuantity = quantityInStockUnit(quantity, item.unit, stockItem);
  return { unitCost, totalCost: stockQuantity * unitCost };
}

export default function AdminProductionPage() {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [losses, setLosses] = useState<ProductionLossEvent[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [recipeForm, setRecipeForm] = useState<RecipeFormState>(INITIAL_RECIPE_FORM);
  const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
  const [substitution, setSubstitution] = useState<SubstitutionForm>(INITIAL_SUBSTITUTION);
  const [subPreview, setSubPreview] = useState<RecipeSubstitutionPreview | null>(null);
  const [margins, setMargins] = useState<ProductMarginResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [orderData, lossData, marginData, recipeData, stockData] = await Promise.all([
        listProductionOrders(),
        listProductionLosses(),
        listProductMargins(),
        listRecipes(),
        listProductionStockItems(),
      ]);
      setOrders(Array.isArray(orderData) ? orderData : []);
      setLosses(Array.isArray(lossData) ? lossData : []);
      setMargins(marginData);
      setRecipes(Array.isArray(recipeData) ? recipeData : []);
      setStockItems(Array.isArray(stockData) ? stockData : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar producao interna.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const productionRecipes = useMemo(
    () => recipes.filter((recipe) => recipe.type === 'PRODUCTION'),
    [recipes],
  );

  const filteredRecipes = useMemo(() => {
    const search = recipeSearch.trim().toLowerCase();
    if (!search) return productionRecipes;
    return productionRecipes.filter((recipe) => {
      const haystack = [
        recipe.name,
        recipe.preparationSummary ?? '',
        recipe.notes ?? '',
        recipeIngredientNames(recipe),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [productionRecipes, recipeSearch]);

  const totals = useMemo(() => {
    const planned = orders.filter((item) => item.status === 'PLANNED').length;
    const progress = orders.filter((item) => item.status === 'IN_PROGRESS').length;
    const done = orders.filter((item) => item.status === 'FINISHED').length;
    const canceled = orders.filter((item) => item.status === 'CANCELED').length;
    return { planned, progress, done, canceled };
  }, [orders]);

  const stockItemById = useMemo(
    () => new Map(stockItems.map((item) => [item.id, item])),
    [stockItems],
  );

  const productionOutputOptions = useMemo(
    () => stockItems.filter((item) => item.stockType !== 'PRODUCT' && isProductionOutputItem(item)),
    [stockItems],
  );

  const ingredientOptions = useMemo(
    () => stockItems.filter((item) => item.stockType !== 'PRODUCT' && !isProductionOutputItem(item)),
    [stockItems],
  );

  function openCreateRecipe() {
    setEditingRecipe(null);
    setRecipeForm(INITIAL_RECIPE_FORM);
    setRecipeModalOpen(true);
  }

  function openEditRecipe(recipe: Recipe) {
    setEditingRecipe(recipe);
    setRecipeForm({
      name: recipe.name,
      yieldQuantity: String(recipe.yieldQuantity ?? 1),
      yieldUnit: recipe.yieldUnit || 'un',
      lossPercent: String(recipe.lossPercent ?? 0),
      preparationSummary: recipe.preparationSummary ?? '',
      notes: recipe.notes ?? '',
      active: recipe.active,
      items: recipe.items.length
        ? recipe.items.map((item) => ({
            stockItemId: item.stockItemId,
            quantity: String(item.quantity ?? ''),
            unit: item.unit || 'un',
            optional: item.optional,
            affectsStock: item.affectsStock,
            affectsCost: item.affectsCost,
          }))
        : [emptyRecipeItem()],
    });
    setRecipeModalOpen(true);
  }

  function updateRecipeItem(index: number, patch: Partial<RecipeFormItem>) {
    setRecipeForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  }

  function removeRecipeItem(index: number) {
    setRecipeForm((prev) => ({
      ...prev,
      items: prev.items.length <= 1 ? [emptyRecipeItem()] : prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function recipeItemsPayload(): RecipeItemPayload[] | null {
    const items = recipeForm.items
      .map((item) => ({
        stockItemId: item.stockItemId.trim(),
        quantity: Number(item.quantity),
        unit: item.unit.trim(),
        optional: item.optional,
        affectsStock: item.affectsStock,
        affectsCost: item.affectsCost,
      }))
      .filter((item) => item.stockItemId);

    if (!items.length) {
      setError('Adicione pelo menos um insumo a receita.');
      return null;
    }
    if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0 || !item.unit)) {
      setError('Confira quantidade e unidade dos insumos da receita.');
      return null;
    }
    return items;
  }

  async function onSaveRecipe() {
    setError(null);
    setSuccess(null);
    const name = recipeForm.name.trim();
    const yieldQuantity = Number(recipeForm.yieldQuantity);
    const lossPercent = recipeForm.lossPercent.trim() ? Number(recipeForm.lossPercent) : null;
    const items = recipeItemsPayload();

    if (!name) {
      setError('Nome do subproduto e obrigatorio.');
      return;
    }
    if (!Number.isFinite(yieldQuantity) || yieldQuantity <= 0) {
      setError('Quantidade rendida deve ser maior que zero.');
      return;
    }
    if (lossPercent !== null && (!Number.isFinite(lossPercent) || lossPercent < 0 || lossPercent > 100)) {
      setError('Perda deve estar entre 0 e 100%.');
      return;
    }
    if (!items) return;

    setBusyId('recipe-save');
    try {
      if (editingRecipe) {
        await updateRecipe(editingRecipe.id, {
          name,
          type: 'PRODUCTION',
          yieldQuantity,
          yieldUnit: recipeForm.yieldUnit,
          lossPercent,
          preparationSummary: recipeForm.preparationSummary,
          notes: recipeForm.notes,
          active: recipeForm.active,
        });
        await replaceRecipeItems(editingRecipe.id, items);
        setSuccess('Receita atualizada.');
      } else {
        await createRecipe({
          name,
          type: 'PRODUCTION',
          yieldQuantity,
          yieldUnit: recipeForm.yieldUnit,
          lossPercent,
          preparationSummary: recipeForm.preparationSummary,
          notes: recipeForm.notes,
          items,
        });
        setSuccess('Receita cadastrada.');
      }
      setRecipeModalOpen(false);
      setEditingRecipe(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar receita.');
    } finally {
      setBusyId(null);
    }
  }

  async function onDisableRecipe() {
    if (!editingRecipe) return;
    if (!window.confirm('Excluir esta receita? Ela sera desativada para preservar historico.')) return;
    setBusyId('recipe-delete');
    setError(null);
    setSuccess(null);
    try {
      await updateRecipe(editingRecipe.id, { active: false });
      setSuccess('Receita desativada.');
      setRecipeModalOpen(false);
      setEditingRecipe(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir receita.');
    } finally {
      setBusyId(null);
    }
  }

  async function onCreateOrder() {
    setError(null);
    setSuccess(null);
    const plannedQuantity = Number(form.plannedQuantity);
    if (!form.stockItemId.trim() || !Number.isFinite(plannedQuantity) || plannedQuantity <= 0) {
      setError('Selecione o item produzido e informe quantidade planejada maior que zero.');
      return;
    }
    setBusyId('create');
    try {
      await createProductionOrder({
        stockItemId: form.stockItemId.trim(),
        recipeId: form.recipeId.trim() || null,
        plannedQuantity,
      });
      setSuccess('Ordem de produção criada.');
      setForm(INITIAL_FORM);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar ordem.');
    } finally {
      setBusyId(null);
    }
  }

  async function onStart(orderId: string) {
    setBusyId(orderId);
    setError(null);
    setSuccess(null);
    try {
      await startProductionOrder(orderId);
      setSuccess('Ordem iniciada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar ordem.');
    } finally {
      setBusyId(null);
    }
  }

  async function onFinish(orderId: string, plannedQuantity: number) {
    setBusyId(orderId);
    setError(null);
    setSuccess(null);
    try {
      await finishProductionOrder(orderId, plannedQuantity);
      setSuccess('Ordem finalizada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao finalizar ordem.');
    } finally {
      setBusyId(null);
    }
  }

  async function onCancel(orderId: string) {
    const reason = window.prompt('Motivo do cancelamento:')?.trim();
    if (!reason) return;
    setBusyId(orderId);
    setError(null);
    setSuccess(null);
    try {
      await cancelProductionOrder(orderId, reason);
      setSuccess('Ordem cancelada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cancelar ordem.');
    } finally {
      setBusyId(null);
    }
  }

  async function onRegisterLoss(orderId: string) {
    const quantityRaw = window.prompt('Quantidade perdida:');
    if (!quantityRaw) return;
    const quantity = Number(quantityRaw);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Quantidade de perda invalida.');
      return;
    }
    const reason = window.prompt('Motivo da perda (opcional):')?.trim();

    setBusyId(orderId);
    setError(null);
    setSuccess(null);
    try {
      await registerProductionLoss(orderId, { quantity, reason: reason || undefined });
      setSuccess('Perda de preparo registrada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar perda.');
    } finally {
      setBusyId(null);
    }
  }

  async function onPreviewSubstitution() {
    if (!substitution.recipeId.trim() || !substitution.fromStockItemId.trim() || !substitution.toStockItemId.trim()) {
      setError('Selecione a ficha técnica, o item de origem e o item substituto.');
      return;
    }
    const quantityRatio = Number(substitution.quantityRatio || '1');
    if (!Number.isFinite(quantityRatio) || quantityRatio <= 0) {
      setError('quantityRatio deve ser maior que zero.');
      return;
    }
    setBusyId('sub-preview');
    setError(null);
    try {
      const preview = await previewRecipeSubstitution(substitution.recipeId.trim(), {
        fromStockItemId: substitution.fromStockItemId.trim(),
        toStockItemId: substitution.toStockItemId.trim(),
        quantityRatio,
      });
      setSubPreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar preview de substituicao.');
    } finally {
      setBusyId(null);
    }
  }

  async function onApplySubstitution() {
    if (!subPreview) {
      setError('Gere preview antes de aplicar a substituicao.');
      return;
    }
    setBusyId('sub-apply');
    setError(null);
    setSuccess(null);
    try {
      await applyRecipeSubstitution(substitution.recipeId.trim(), {
        fromStockItemId: substitution.fromStockItemId.trim(),
        toStockItemId: substitution.toStockItemId.trim(),
        quantityRatio: Number(substitution.quantityRatio || '1'),
        reason: substitution.reason.trim() || undefined,
      });
      setSuccess('Substituicao aplicada na ficha tecnica.');
      setSubstitution(INITIAL_SUBSTITUTION);
      setSubPreview(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aplicar substituicao.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Carregando produção interna..." />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="Produção Interna"
        subtitle="Receitas de insumos, subprodutos, ordens de preparo e perdas."
        right={
          <Link href="/admin/stock?section=products">
            <Button>Voltar ao estoque</Button>
          </Link>
        }
      />

      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}>{success}</div> : null}

      <section className={styles.symbolPanel}>
        <div className={styles.symbolIcon}>{productionIcon()}</div>
        <div>
          <span className={styles.eyebrow}>2_PRE_PREPARO</span>
          <h2>Produção Interna</h2>
          <p>Mesma simbologia do Sistema de Gestão: receita/subproduto, rendimento, unidade rendida, insumos e custo automático.</p>
        </div>
      </section>

      <section className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <span>Receitas</span>
          <strong>{productionRecipes.length}</strong>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Planejadas</span>
          <strong>{totals.planned}</strong>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Em preparo</span>
          <strong>{totals.progress}</strong>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Finalizadas</span>
          <strong>{totals.done}</strong>
        </Card>
      </section>

      <Card className={styles.registryPanel}>
        <div className={styles.registryHeader}>
          <div>
            <span className={styles.sheetName}>Receitas de insumos</span>
            <h2>Produção Interna</h2>
          </div>
          <label className={styles.searchBox}>
            <span>Buscar</span>
            <Input
              value={recipeSearch}
              onChange={(event) => setRecipeSearch(event.target.value)}
              placeholder="Subproduto, insumo, preparo..."
            />
          </label>
          <Button variant="primary" onClick={openCreateRecipe}>
            Cadastro de Receita
          </Button>
        </div>
        <div className={styles.registryStatus}>
          {filteredRecipes.length} receitas carregadas
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.recipeTable}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Receita/Subproduto</th>
                <th>Qtd. insumos</th>
                <th>Insumos</th>
                <th>Rendimento (%)</th>
                <th>Unid. rend.</th>
                <th>Custo/unid. rendida</th>
                <th>Preparo resumido</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecipes.length === 0 ? (
                <tr>
                  <td colSpan={9} className={styles.emptyCell}>
                    Nenhuma receita de produção encontrada.
                  </td>
                </tr>
              ) : (
                filteredRecipes.map((recipe) => (
                  <tr key={recipe.id}>
                    <td>{recipe.id.slice(0, 8)}</td>
                    <td>
                      <button type="button" className={styles.cellLink} onClick={() => openEditRecipe(recipe)}>
                        {recipe.name || 'Abrir receita'}
                      </button>
                    </td>
                    <td>{recipe.items.length}</td>
                    <td>{recipeIngredientNames(recipe) || '-'}</td>
                    <td>{formatYieldPercent(recipe)}</td>
                    <td>{recipe.yieldUnit || '-'}</td>
                    <td>{formatMoney(recipe.cost?.costPerYieldUnit)}</td>
                    <td>{recipe.preparationSummary || '-'}</td>
                    <td>
                      <Badge>{recipe.active ? 'Ativa' : 'Inativa'}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Nova ordem de produção</h2>
          <Badge>Execução</Badge>
        </div>
        <div className={styles.form}>
          <label className={styles.field}>
            <span>Item produzido</span>
            <select
              className={styles.select}
              value={form.stockItemId}
              onChange={(event) => setForm((prev) => ({ ...prev, stockItemId: event.target.value }))}
            >
              <option value="">Selecione um item</option>
              {productionOutputOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.code ? ` (${item.code})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Receita vinculada (opcional)</span>
            <select
              className={styles.select}
              value={form.recipeId}
              onChange={(event) => setForm((prev) => ({ ...prev, recipeId: event.target.value }))}
            >
              <option value="">Sem receita vinculada</option>
              {productionRecipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.name} - {formatYieldPercent(recipe)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Quantidade planejada</span>
            <Input type="number" min="0.001" step="0.001" value={form.plannedQuantity} onChange={(e) => setForm((prev) => ({ ...prev, plannedQuantity: e.target.value }))} />
          </label>
          <Button variant="primary" onClick={() => void onCreateOrder()} disabled={busyId === 'create'}>
            {busyId === 'create' ? 'Salvando...' : 'Criar ordem'}
          </Button>
        </div>
      </Card>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Ordens da filial</h2>
        </div>

        <div className={styles.list}>
          {orders.length === 0 ? (
            <Card className={styles.orderCard}>Sem ordens de produção para esta filial.</Card>
          ) : (
            orders.map((order) => (
              <article key={order.id} className={styles.orderCard}>
                <div className={styles.orderTop}>
                  <strong>{order.recipe?.name ?? order.stockItem?.name ?? order.id}</strong>
                  <Badge>{statusLabel(order.status)}</Badge>
                </div>
                <div className={styles.orderMeta}>
                  <span>Planejado: {formatNumber(order.plannedQuantity)}</span>
                  <span>Realizado: {order.actualQuantity === null ? '-' : formatNumber(order.actualQuantity)}</span>
                  <span>Item: {order.stockItem?.name ?? order.stockItemId}</span>
                  <span>Receita: {order.recipe?.name ?? '-'}</span>
                </div>
                <div className={styles.orderActions}>
                  {order.status === 'PLANNED' ? (
                    <Button variant="primary" onClick={() => void onStart(order.id)} disabled={busyId === order.id}>
                      Iniciar
                    </Button>
                  ) : null}
                  {order.status === 'PLANNED' || order.status === 'IN_PROGRESS' ? (
                    <Button onClick={() => void onFinish(order.id, Number(order.plannedQuantity))} disabled={busyId === order.id}>
                      Finalizar
                    </Button>
                  ) : null}
                  {order.status === 'PLANNED' || order.status === 'IN_PROGRESS' ? (
                    <Button onClick={() => void onCancel(order.id)} disabled={busyId === order.id}>
                      Cancelar
                    </Button>
                  ) : null}
                  <Button onClick={() => void onRegisterLoss(order.id)} disabled={busyId === order.id}>
                    Registrar perda
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>
      </Card>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Perdas de preparo</h2>
          <Badge>{losses.length} eventos</Badge>
        </div>
        <div className={styles.list}>
          {losses.length === 0 ? (
            <Card className={styles.orderCard}>Sem perdas registradas para esta filial.</Card>
          ) : (
            losses.map((loss) => (
              <article key={loss.id} className={styles.orderCard}>
                <div className={styles.orderTop}>
                  <strong>Ordem: {loss.sourceId ?? '-'}</strong>
                  <Badge>Perda</Badge>
                </div>
                <div className={styles.orderMeta}>
                  <span>Item: {loss.stockItemId}</span>
                  <span>Quantidade: {formatNumber(loss.quantity)}</span>
                  <span>Custo unitário: {formatMoney(loss.unitCost)}</span>
                  <span>Custo total: {formatMoney(loss.totalCost)}</span>
                  <span>Motivo: {loss.notes ?? '-'}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </Card>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Substituicao de insumos</h2>
          <Badge>Receita</Badge>
        </div>
        <div className={styles.form}>
          <label className={styles.field}>
            <span>Receita</span>
            <select
              className={styles.select}
              value={substitution.recipeId}
              onChange={(event) => setSubstitution((prev) => ({ ...prev, recipeId: event.target.value }))}
            >
              <option value="">Selecione uma receita</option>
              {productionRecipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Item de origem</span>
            <select
              className={styles.select}
              value={substitution.fromStockItemId}
              onChange={(event) => setSubstitution((prev) => ({ ...prev, fromStockItemId: event.target.value }))}
            >
              <option value="">Selecione o item atual</option>
              {ingredientOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.code ? ` (${item.code})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Item substituto</span>
            <select
              className={styles.select}
              value={substitution.toStockItemId}
              onChange={(event) => setSubstitution((prev) => ({ ...prev, toStockItemId: event.target.value }))}
            >
              <option value="">Selecione o novo item</option>
              {ingredientOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.code ? ` (${item.code})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Fator de quantidade</span>
            <Input type="number" min="0.001" step="0.001" value={substitution.quantityRatio} onChange={(e) => setSubstitution((p) => ({ ...p, quantityRatio: e.target.value }))} />
          </label>
        </div>
        <div className={styles.form}>
          <label className={styles.field}>
            <span>Motivo (opcional)</span>
            <Input value={substitution.reason} onChange={(e) => setSubstitution((p) => ({ ...p, reason: e.target.value }))} />
          </label>
          <Button onClick={() => void onPreviewSubstitution()} disabled={busyId === 'sub-preview'}>
            {busyId === 'sub-preview' ? 'Processando...' : 'Gerar preview'}
          </Button>
          <Button variant="primary" onClick={() => void onApplySubstitution()} disabled={busyId === 'sub-apply'}>
            {busyId === 'sub-apply' ? 'Aplicando...' : 'Aplicar substituicao'}
          </Button>
        </div>
        {subPreview ? (
          <Card className={styles.orderCard}>
            <div className={styles.orderMeta}>
              <span>Origem: {subPreview.from.name ?? subPreview.from.stockItemId} ({formatMoney(subPreview.from.totalCost)})</span>
              <span>Substituto: {subPreview.to.name ?? subPreview.to.stockItemId} ({formatMoney(subPreview.to.totalCost)})</span>
              <span>Delta custo total: {formatMoney(subPreview.impact.deltaTotalCost)}</span>
            </div>
          </Card>
        ) : null}
      </Card>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Margem por produto</h2>
          <Badge>{margins?.summary.total ?? 0} produtos</Badge>
        </div>
        <div className={styles.list}>
          {!margins || margins.items.length === 0 ? (
            <Card className={styles.orderCard}>Sem produtos com ficha técnica para análise de margem.</Card>
          ) : (
            margins.items.map((item) => (
              <article key={item.productId} className={styles.orderCard}>
                <div className={styles.orderTop}>
                  <strong>{item.productName}</strong>
                  <Badge>{item.health}</Badge>
                </div>
                <div className={styles.orderMeta}>
                  <span>Preço venda: {formatMoney(item.effectiveSalePrice)}</span>
                  <span>Custo unitário: {formatMoney(item.costPerUnit)}</span>
                  <span>Margem: {formatMoney(item.marginValue)}</span>
                  <span>Margem %: {item.marginPercent === null ? '-' : `${item.marginPercent.toFixed(2)}%`}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </Card>

      {recipeModalOpen ? (
        <div className={styles.modalBackdrop} role="presentation">
          <section className={styles.recipeDialog} role="dialog" aria-modal="true" aria-labelledby="recipeDialogTitle">
            <header className={styles.dialogHeader}>
              <div>
                <span className={styles.eyebrow}>Produção Interna</span>
                <h2 id="recipeDialogTitle">{editingRecipe ? 'Atualizar Receita' : 'Cadastro de Receita'}</h2>
              </div>
              <button type="button" className={styles.closeButton} aria-label="Fechar" onClick={() => setRecipeModalOpen(false)}>
                x
              </button>
            </header>
            <div className={styles.recipeBody}>
              <div className={styles.recipeHeadFields}>
                <label className={styles.field}>
                  <span>ID</span>
                  <input className={styles.readonlyInput} value={editingRecipe?.id.slice(0, 8) ?? 'Automatico'} disabled />
                </label>
                <label className={styles.field}>
                  <span>Nome do subproduto</span>
                  <input
                    className={styles.textInput}
                    value={recipeForm.name}
                    onChange={(event) => setRecipeForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                  />
                </label>
                <label className={styles.field}>
                  <span>Qtd. rendida</span>
                  <input
                    className={styles.textInput}
                    inputMode="decimal"
                    value={recipeForm.yieldQuantity}
                    onChange={(event) => setRecipeForm((prev) => ({ ...prev, yieldQuantity: event.target.value }))}
                    placeholder="Ex.: 1"
                  />
                </label>
                <label className={styles.field}>
                  <span>Unid. rend.</span>
                  <select
                    className={styles.select}
                    value={recipeForm.yieldUnit}
                    onChange={(event) => setRecipeForm((prev) => ({ ...prev, yieldUnit: event.target.value }))}
                  >
                    {UNIT_OPTIONS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Perda (%)</span>
                  <input
                    className={styles.textInput}
                    inputMode="decimal"
                    value={recipeForm.lossPercent}
                    onChange={(event) => setRecipeForm((prev) => ({ ...prev, lossPercent: event.target.value }))}
                    placeholder="Ex.: 0"
                  />
                </label>
                <label className={styles.field}>
                  <span>Ativo?</span>
                  <select
                    className={styles.select}
                    value={recipeForm.active ? 'yes' : 'no'}
                    onChange={(event) => setRecipeForm((prev) => ({ ...prev, active: event.target.value === 'yes' }))}
                  >
                    <option value="yes">Sim</option>
                    <option value="no">Nao</option>
                  </select>
                </label>
                <label className={`${styles.field} ${styles.wideField}`}>
                  <span>Preparo resumido</span>
                  <textarea
                    className={styles.textarea}
                    value={recipeForm.preparationSummary}
                    onChange={(event) => setRecipeForm((prev) => ({ ...prev, preparationSummary: event.target.value }))}
                  />
                </label>
                <label className={`${styles.field} ${styles.wideField}`}>
                  <span>Obs.</span>
                  <textarea
                    className={styles.textarea}
                    value={recipeForm.notes}
                    onChange={(event) => setRecipeForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </label>
              </div>
              <section className={styles.ingredientsSection}>
                <div className={styles.ingredientsHead}>
                  <h3>Insumos da receita</h3>
                  <Button type="button" onClick={() => setRecipeForm((prev) => ({ ...prev, items: [...prev.items, emptyRecipeItem()] }))}>
                    Adicionar Insumo
                  </Button>
                </div>
                <div className={styles.ingredientsWrap}>
                  <table className={styles.recipeIngredientsTable}>
                    <thead>
                      <tr>
                        <th>Insumo bruto</th>
                        <th>Qtd</th>
                        <th>Unid</th>
                        <th>Custo unit. auto</th>
                        <th>Custo item</th>
                        <th>Baixa</th>
                        <th>Custo</th>
                        <th>Remover</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipeForm.items.map((item, index) => {
                        const costs = recipeItemCost(item, stockItemById);
                        return (
                          <tr key={`${item.stockItemId}-${index}`}>
                            <td>
                              <select
                                className={styles.tableSelect}
                                value={item.stockItemId}
                                onChange={(event) => {
                                  const stockItem = stockItemById.get(event.target.value);
                                  updateRecipeItem(index, {
                                    stockItemId: event.target.value,
                                    unit: stockItem?.stockUnit ?? item.unit,
                                  });
                                }}
                              >
                                <option value="">Selecione...</option>
                                {ingredientOptions.map((stockItem) => (
                                  <option key={stockItem.id} value={stockItem.id}>
                                    {stockItem.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                className={styles.tableInput}
                                inputMode="decimal"
                                value={item.quantity}
                                onChange={(event) => updateRecipeItem(index, { quantity: event.target.value })}
                              />
                            </td>
                            <td>
                              <select
                                className={styles.tableSelect}
                                value={item.unit}
                                onChange={(event) => updateRecipeItem(index, { unit: event.target.value })}
                              >
                                {UNIT_OPTIONS.map((unit) => (
                                  <option key={unit} value={unit}>
                                    {unit}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>{formatMoney(costs.unitCost)}</td>
                            <td>{formatMoney(costs.totalCost)}</td>
                            <td>
                              <input
                                type="checkbox"
                                checked={item.affectsStock}
                                onChange={(event) => updateRecipeItem(index, { affectsStock: event.target.checked })}
                              />
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={item.affectsCost}
                                onChange={(event) => updateRecipeItem(index, { affectsCost: event.target.checked })}
                              />
                            </td>
                            <td>
                              <button type="button" className={styles.removeIngredient} onClick={() => removeRecipeItem(index)}>
                                x
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <footer className={styles.dialogFooter}>
              {editingRecipe ? (
                <button type="button" className={styles.dangerButton} onClick={() => void onDisableRecipe()} disabled={busyId === 'recipe-delete'}>
                  Excluir Receita
                </button>
              ) : (
                <span />
              )}
              <span />
              <Button type="button" onClick={() => setRecipeModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" variant="primary" onClick={() => void onSaveRecipe()} disabled={busyId === 'recipe-save'}>
                {busyId === 'recipe-save' ? 'Salvando...' : 'Salvar Receita'}
              </Button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
