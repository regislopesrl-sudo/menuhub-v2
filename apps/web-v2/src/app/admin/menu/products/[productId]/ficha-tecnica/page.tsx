'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  createRecipe,
  getProductRecipeComposition,
  linkProductRecipe,
  listRecipes,
  replaceRecipeItems,
  updateRecipe,
  type ProductRecipeComposition,
  type Recipe,
  type RecipeCreatePayload,
  type RecipeItemPayload,
  type RecipeType,
} from '@/features/recipes/recipes.api';
import { listStockItems, listStockProductAvailability, type StockItem, type StockProductAvailability } from '@/features/stock/stock.api';
import styles from './page.module.css';

type RecipeItemDraft = {
  stockItemId: string;
  quantity: string;
  unit: string;
  optional: boolean;
  affectsStock: boolean;
  affectsCost: boolean;
};

type RecipeFormState = {
  name: string;
  type: RecipeType;
  yieldQuantity: string;
  yieldUnit: string;
  lossPercent: string;
  active: boolean;
  items: RecipeItemDraft[];
};

const DEFAULT_UNIT = 'un';

function getRouteParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? '';
}

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
  return `${Number(value).toFixed(1)}%`;
}

function normalizeSearch(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSearchTokens(value: unknown) {
  const ignored = new Set(['com', 'sem', 'de', 'da', 'do', 'dos', 'das', 'ao', 'a', 'o', 'e', 'em', 'kg', 'un']);
  return normalizeSearch(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !ignored.has(token));
}

function itemFromStock(stockItem?: StockItem): RecipeItemDraft {
  return {
    stockItemId: stockItem?.id ?? '',
    quantity: '1',
    unit: stockItem?.stockUnit ?? DEFAULT_UNIT,
    optional: false,
    affectsStock: true,
    affectsCost: true,
  };
}

function isIngredientStockItem(stockItem: StockItem) {
  return stockItem.stockType === 'RAW_MATERIAL';
}

function emptyForm(productName: string, stockItems: StockItem[]): RecipeFormState {
  return {
    name: `Ficha tecnica - ${productName || 'Produto'}`,
    type: 'SALE',
    yieldQuantity: '1',
    yieldUnit: DEFAULT_UNIT,
    lossPercent: '0',
    active: true,
    items: stockItems.length > 0 ? [itemFromStock(stockItems[0])] : [],
  };
}

function formFromRecipe(recipe: Recipe, stockItems: StockItem[]): RecipeFormState {
  const stockItemIds = new Set(stockItems.map((stockItem) => stockItem.id));
  const items = recipe.items
    .filter((item) => stockItemIds.has(item.stockItemId))
    .map((item) => ({
      stockItemId: item.stockItemId,
      quantity: String(item.quantity ?? 1),
      unit: item.unit || DEFAULT_UNIT,
      optional: item.optional === true,
      affectsStock: item.affectsStock !== false,
      affectsCost: item.affectsCost !== false,
    }));

  return {
    name: recipe.name,
    type: recipe.type,
    yieldQuantity: String(recipe.yieldQuantity ?? 1),
    yieldUnit: recipe.yieldUnit || DEFAULT_UNIT,
    lossPercent: String(recipe.lossPercent ?? 0),
    active: recipe.active !== false,
    items: items.length > 0 ? items : stockItems.length > 0 ? [itemFromStock(stockItems[0])] : [],
  };
}

export default function ProductTechnicalSheetPage() {
  const params = useParams<{ productId?: string | string[] }>();
  const productId = getRouteParam(params?.productId);

  const [composition, setComposition] = useState<ProductRecipeComposition | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [productAvailability, setProductAvailability] = useState<StockProductAvailability | null>(null);
  const [form, setForm] = useState<RecipeFormState>(() => emptyForm('', []));
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const [compositionData, recipesData, stockData, availabilityData] = await Promise.all([
        getProductRecipeComposition(productId),
        listRecipes().catch(() => []),
        listStockItems().catch(() => []),
        listStockProductAvailability().catch(() => []),
      ]);
      const normalizedRecipes = Array.isArray(recipesData) ? recipesData : [];
      const normalizedStock = (Array.isArray(stockData) ? stockData : []).filter(isIngredientStockItem);
      const availability = (Array.isArray(availabilityData) ? availabilityData : []).find((product) => product.productId === productId) ?? null;
      setComposition(compositionData);
      setRecipes(normalizedRecipes);
      setStockItems(normalizedStock);
      setProductAvailability(availability);
      setSelectedRecipeId('');
      setForm(compositionData.recipe ? formFromRecipe(compositionData.recipe, normalizedStock) : emptyForm(compositionData.productName, normalizedStock));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar ficha tecnica.');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableRecipes = useMemo(
    () => recipes.filter((recipe) => recipe.id !== composition?.recipeId),
    [composition?.recipeId, recipes],
  );

  const linkedRecipe = composition?.recipe ?? null;
  const productName = composition?.productName ?? 'Produto';
  const stockItemById = useMemo(() => new Map(stockItems.map((item) => [item.id, item] as const)), [stockItems]);
  const liveCostPreview = useMemo(() => {
    const yieldQuantity = Number(form.yieldQuantity || '0');
    const lossPercent = Number(form.lossPercent || '0');
    const grossCost = form.items.reduce((acc, item) => {
      if (!item.affectsCost) return acc;
      const stockItem = stockItemById.get(item.stockItemId);
      const quantity = Number(item.quantity || '0');
      if (!stockItem || !Number.isFinite(quantity) || quantity <= 0) return acc;
      return acc + quantity * Number(stockItem.averageCost ?? 0);
    }, 0);
    const lossFactor = Number.isFinite(lossPercent) ? 1 + Math.max(0, lossPercent) / 100 : 1;
    const totalCost = grossCost * lossFactor;
    const costPerYieldUnit = Number.isFinite(yieldQuantity) && yieldQuantity > 0 ? totalCost / yieldQuantity : 0;
    const salePrice = Number(productAvailability?.salePrice ?? 0);
    const margin = salePrice > 0 ? salePrice - costPerYieldUnit : null;
    const marginPercent = salePrice > 0 && margin !== null ? (margin / salePrice) * 100 : null;

    return { grossCost, totalCost, costPerYieldUnit, salePrice, margin, marginPercent };
  }, [form.items, form.lossPercent, form.yieldQuantity, productAvailability?.salePrice, stockItemById]);
  const affectsStockCount = useMemo(
    () => form.items.filter((item) => item.affectsStock && item.stockItemId).length,
    [form.items],
  );
  const suggestedStockItems = useMemo(() => {
    const productTokens = getSearchTokens(productName);
    if (productTokens.length === 0) return stockItems.slice(0, 4);

    return stockItems
      .map((stockItem) => {
        const haystack = normalizeSearch(`${stockItem.name} ${stockItem.code ?? ''} ${stockItem.category?.name ?? ''}`);
        const score = productTokens.reduce((acc, token) => acc + (haystack.includes(token) ? 1 : 0), 0);
        return { stockItem, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.stockItem.name.localeCompare(right.stockItem.name))
      .slice(0, 6)
      .map((entry) => entry.stockItem);
  }, [productName, stockItems]);

  const updateItem = (index: number, patch: Partial<RecipeItemDraft>) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const addItem = () => {
    setForm((current) => ({ ...current, items: [...current.items, itemFromStock(stockItems[0])] }));
  };

  const removeItem = (index: number) => {
    setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
  };

  const applySuggestedItems = () => {
    const candidates = suggestedStockItems.length > 0 ? suggestedStockItems : stockItems.slice(0, 3);
    if (candidates.length === 0) {
      setError('Cadastre insumos em Estoque antes de usar a sugestao automatica.');
      return;
    }
    setForm((current) => ({
      ...current,
      items: candidates.slice(0, 4).map((stockItem) => itemFromStock(stockItem)),
    }));
    setNotice('Sugestao automatica aplicada. Revise quantidades e unidades antes de salvar.');
  };

  const buildPayload = (): RecipeCreatePayload => {
    const name = form.name.trim();
    const yieldQuantity = Number(form.yieldQuantity || '0');
    const lossPercent = form.lossPercent.trim() ? Number(form.lossPercent) : 0;

    if (!name) throw new Error('Informe o nome da ficha tecnica.');
    if (!Number.isFinite(yieldQuantity) || yieldQuantity <= 0) throw new Error('Informe rendimento maior que zero.');
    if (!form.yieldUnit.trim()) throw new Error('Informe a unidade de rendimento.');
    if (!Number.isFinite(lossPercent) || lossPercent < 0 || lossPercent > 100) {
      throw new Error('Informe perda entre 0 e 100%.');
    }

    const items: RecipeItemPayload[] = form.items.map((item) => {
      const quantity = Number(item.quantity || '0');
      if (!item.stockItemId.trim()) throw new Error('Selecione o insumo de todos os itens.');
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Informe quantidade maior que zero em todos os itens.');
      if (!item.unit.trim()) throw new Error('Informe unidade em todos os itens.');
      return {
        stockItemId: item.stockItemId,
        quantity,
        unit: item.unit.trim(),
        optional: item.optional,
        affectsStock: item.affectsStock,
        affectsCost: item.affectsCost,
      };
    });

    if (items.length === 0) throw new Error('Adicione ao menos um insumo na ficha tecnica.');

    return {
      name,
      type: form.type,
      yieldQuantity,
      yieldUnit: form.yieldUnit.trim(),
      lossPercent,
      items,
    };
  };

  const saveRecipe = async () => {
    if (!productId) return;
    setBusy('save');
    setError(null);
    setNotice(null);
    try {
      const payload = buildPayload();
      if (linkedRecipe?.id) {
        await updateRecipe(linkedRecipe.id, {
          name: payload.name,
          type: payload.type,
          yieldQuantity: payload.yieldQuantity,
          yieldUnit: payload.yieldUnit,
          lossPercent: payload.lossPercent ?? 0,
          active: form.active,
        });
        await replaceRecipeItems(linkedRecipe.id, payload.items);
        setNotice('Ficha tecnica atualizada.');
      } else {
        const created = await createRecipe(payload);
        await linkProductRecipe(productId, created.id);
        setNotice('Ficha tecnica criada e vinculada ao produto.');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar ficha tecnica.');
    } finally {
      setBusy(null);
    }
  };

  const linkExistingRecipe = async () => {
    if (!productId || !selectedRecipeId) {
      setError('Selecione uma ficha tecnica existente.');
      return;
    }
    setBusy('link');
    setError(null);
    setNotice(null);
    try {
      await linkProductRecipe(productId, selectedRecipeId);
      setNotice('Ficha tecnica vinculada ao produto.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao vincular ficha tecnica.');
    } finally {
      setBusy(null);
    }
  };

  const unlinkRecipe = async () => {
    if (!productId || !linkedRecipe?.id) return;
    if (!window.confirm(`Desvincular a ficha tecnica de ${productName}?`)) return;
    setBusy('unlink');
    setError(null);
    setNotice(null);
    try {
      await linkProductRecipe(productId, null);
      setNotice('Ficha tecnica desvinculada do produto.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao desvincular ficha tecnica.');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Carregando ficha tecnica..." />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="Ficha tecnica"
        subtitle={productName}
        right={
          <Link href="/admin/menu">
            <Button>Voltar ao catalogo</Button>
          </Link>
        }
      />

      {error ? <div className={styles.error}>{error}</div> : null}
      {notice ? <div className={styles.success}>{notice}</div> : null}

      <section className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <span>Produto</span>
          <strong>{productName}</strong>
          <small>{composition?.sku ? `SKU ${composition.sku}` : 'Sem SKU'}</small>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Status</span>
          <strong>{linkedRecipe ? 'Vinculada' : 'Sem ficha'}</strong>
          <small>{linkedRecipe?.active === false ? 'Ficha inativa' : 'Pronta para custo'}</small>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Custo total</span>
          <strong>{formatMoney(linkedRecipe?.cost.totalCost)}</strong>
          <small>{linkedRecipe ? 'Com perdas da ficha' : 'Cadastre os insumos'}</small>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Custo por unidade</span>
          <strong>{formatMoney(linkedRecipe?.cost.costPerYieldUnit)}</strong>
          <small>{linkedRecipe ? `${linkedRecipe.yieldQuantity} ${linkedRecipe.yieldUnit}` : 'Sem rendimento'}</small>
        </Card>
      </section>

      {stockItems.length === 0 ? (
        <div className={styles.warning}>
          <strong>Nenhum insumo de estoque encontrado.</strong>
          <span>Cadastre os insumos em Estoque antes de montar a ficha tecnica.</span>
          <Link href="/admin/stock">Abrir estoque</Link>
        </div>
      ) : null}

      {!linkedRecipe && availableRecipes.length > 0 ? (
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Vincular ficha existente</h2>
              <p>Use uma ficha ja cadastrada para este produto.</p>
            </div>
            <Badge>{availableRecipes.length} fichas</Badge>
          </div>
          <div className={styles.inlineForm}>
            <Select value={selectedRecipeId} onChange={(event) => setSelectedRecipeId(event.target.value)}>
              <option value="">Selecione uma ficha</option>
              {availableRecipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.name} - {recipe.yieldQuantity} {recipe.yieldUnit}
                </option>
              ))}
            </Select>
            <Button variant="primary" onClick={() => void linkExistingRecipe()} disabled={busy === 'link'}>
              {busy === 'link' ? 'Vinculando...' : 'Vincular'}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>{linkedRecipe ? 'Editar ficha do produto' : 'Criar ficha do produto'}</h2>
            <p>Defina os insumos e o rendimento para calcular custo e margem.</p>
          </div>
          <Badge tone={linkedRecipe ? 'success' : 'warning'}>{linkedRecipe ? 'Vinculada' : 'Nova ficha'}</Badge>
        </div>

        <div className={styles.assistantPanel}>
          <div>
            <span>Assistente de ficha</span>
            <strong>{suggestedStockItems.length > 0 ? `${suggestedStockItems.length} sugestao(oes) encontradas` : 'Sem sugestao pelo nome'}</strong>
            <small>Usa apenas insumos cadastrados em Estoque. Produtos e adicionais ficam fora da lista.</small>
          </div>
          <div className={styles.suggestionChips}>
            {suggestedStockItems.length === 0 ? <span>Nenhum insumo parecido com o nome do produto.</span> : null}
            {suggestedStockItems.map((stockItem) => (
              <span key={stockItem.id}>{stockItem.name}</span>
            ))}
          </div>
          <Button onClick={applySuggestedItems} disabled={stockItems.length === 0}>
            Sugerir insumos
          </Button>
        </div>

        <div className={styles.liveCostPanel}>
          <div>
            <span>Custo bruto</span>
            <strong>{formatMoney(liveCostPreview.grossCost)}</strong>
          </div>
          <div>
            <span>Custo com perdas</span>
            <strong>{formatMoney(liveCostPreview.totalCost)}</strong>
          </div>
          <div>
            <span>Custo por unidade</span>
            <strong>{formatMoney(liveCostPreview.costPerYieldUnit)}</strong>
          </div>
          <div>
            <span>Preco venda</span>
            <strong>{liveCostPreview.salePrice > 0 ? formatMoney(liveCostPreview.salePrice) : '-'}</strong>
          </div>
          <div>
            <span>Margem prevista</span>
            <strong>{liveCostPreview.margin === null ? '-' : formatMoney(liveCostPreview.margin)}</strong>
          </div>
          <div>
            <span>% margem</span>
            <strong>{formatPercent(liveCostPreview.marginPercent)}</strong>
          </div>
        </div>

        {affectsStockCount === 0 ? (
          <div className={styles.warning}>
            <strong>A ficha ainda nao baixa estoque.</strong>
            <span>Marque pelo menos um insumo com "Baixa estoque" para o produto consumir estoque automaticamente na venda.</span>
          </div>
        ) : null}

        <div className={styles.formGrid}>
          <label className={styles.fieldWide}>
            <span>Nome da ficha</span>
            <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            <span>Tipo</span>
            <Select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as RecipeType }))}>
              <option value="SALE">Venda</option>
              <option value="PRODUCTION">Producao</option>
            </Select>
          </label>
          <label>
            <span>Rendimento</span>
            <Input type="number" min="0.001" step="0.001" value={form.yieldQuantity} onChange={(event) => setForm((current) => ({ ...current, yieldQuantity: event.target.value }))} />
          </label>
          <label>
            <span>Unidade</span>
            <Input value={form.yieldUnit} onChange={(event) => setForm((current) => ({ ...current, yieldUnit: event.target.value }))} />
          </label>
          <label>
            <span>Perda %</span>
            <Input type="number" min="0" max="100" step="0.01" value={form.lossPercent} onChange={(event) => setForm((current) => ({ ...current, lossPercent: event.target.value }))} />
          </label>
          <label className={styles.checkField}>
            <input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />
            Ficha ativa
          </label>
        </div>

        <div className={styles.itemsHeader}>
          <div>
            <h3>Insumos</h3>
            <p>Informe o item de estoque, quantidade consumida e unidade usada na ficha.</p>
          </div>
          <Button onClick={addItem} disabled={stockItems.length === 0}>Adicionar insumo</Button>
        </div>

        <div className={styles.itemsList}>
          {form.items.length === 0 ? <div className={styles.emptyItems}>Nenhum insumo adicionado.</div> : null}
          {form.items.map((item, index) => {
            const selectedStock = stockItems.find((stockItem) => stockItem.id === item.stockItemId);
            return (
              <div className={styles.itemRow} key={`${item.stockItemId}-${index}`}>
                <label className={styles.itemProduct}>
                  <span>Insumo</span>
                  <Select
                    value={item.stockItemId}
                    onChange={(event) => {
                      const stockItem = stockItems.find((candidate) => candidate.id === event.target.value);
                      updateItem(index, { stockItemId: event.target.value, unit: stockItem?.stockUnit ?? item.unit ?? DEFAULT_UNIT });
                    }}
                  >
                    <option value="">Selecione</option>
                    {stockItems.map((stockItem) => (
                      <option key={stockItem.id} value={stockItem.id}>
                        {stockItem.name}{stockItem.code ? ` (${stockItem.code})` : ''}
                      </option>
                    ))}
                  </Select>
                </label>
                <label>
                  <span>Quantidade</span>
                  <Input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} />
                </label>
                <label>
                  <span>Unidade</span>
                  <Input value={item.unit} onChange={(event) => updateItem(index, { unit: event.target.value })} placeholder={selectedStock?.stockUnit ?? DEFAULT_UNIT} />
                </label>
                <div className={styles.itemChecks}>
                  <label><input type="checkbox" checked={item.affectsStock} onChange={(event) => updateItem(index, { affectsStock: event.target.checked })} /> Baixa estoque</label>
                  <label><input type="checkbox" checked={item.affectsCost} onChange={(event) => updateItem(index, { affectsCost: event.target.checked })} /> Soma custo</label>
                  <label><input type="checkbox" checked={item.optional} onChange={(event) => updateItem(index, { optional: event.target.checked })} /> Opcional</label>
                </div>
                <Button onClick={() => removeItem(index)} disabled={form.items.length <= 1}>Remover</Button>
              </div>
            );
          })}
        </div>

        {linkedRecipe ? (
          <div className={styles.costPanel}>
            <div><span>Custo bruto</span><strong>{formatMoney(linkedRecipe.cost.grossCost)}</strong></div>
            <div><span>Custo com perdas</span><strong>{formatMoney(linkedRecipe.cost.totalCost)}</strong></div>
            <div><span>Custo por unidade</span><strong>{formatMoney(linkedRecipe.cost.costPerYieldUnit)}</strong></div>
            <div><span>Itens</span><strong>{linkedRecipe.items.length}</strong></div>
          </div>
        ) : null}

        <div className={styles.actions}>
          {linkedRecipe ? (
            <Button onClick={() => void unlinkRecipe()} disabled={busy === 'unlink'}>
              {busy === 'unlink' ? 'Desvinculando...' : 'Desvincular ficha'}
            </Button>
          ) : null}
          <Button variant="primary" onClick={() => void saveRecipe()} disabled={busy === 'save' || stockItems.length === 0}>
            {busy === 'save' ? 'Salvando...' : linkedRecipe ? 'Salvar ficha tecnica' : 'Criar e vincular ficha'}
          </Button>
        </div>
      </Card>
    </main>
  );
}
