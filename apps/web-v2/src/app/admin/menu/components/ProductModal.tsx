import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import type { AdminMenuProductPayload, AdminMenuVariationPayload } from '@/features/menu/menu.api';
import type { MenuProduct, MenuProductVariation, MenuRecommendationConfig } from '@/features/menu/menu.mock';
import { CHANNEL_LABELS, type ModalMode } from '../menu-view-model';
import styles from '../page.module.css';
import { AddonGroupsPanel } from './AddonGroupsPanel';
import { ChannelBadges } from './ChannelBadges';

type ProductChannelsState = {
  delivery: boolean;
  pdv: boolean;
  kiosk: boolean;
  waiter: boolean;
};

const PRODUCT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function ProductModal({
  mode,
  product,
  onClose,
  onSave,
  onDelete,
  onToggleAvailability,
  onDuplicate,
  onToggleFeatured,
  onOpenAddons,
  onOpenVariations,
  onOpenRecommendations,
  onOpenTechnicalSheet,
  onSaveRecommendations,
  companyId,
  branchId,
  onProductChanged,
  onError,
  onNotice,
  variationApi,
  recommendationConfig,
  products,
  saving,
  deleting = false,
  actionLoading,
}: {
  mode: ModalMode;
  product?: MenuProduct;
  onClose: () => void;
  onSave: (payload: AdminMenuProductPayload) => void;
  onDelete?: () => void;
  onToggleAvailability?: () => void;
  onDuplicate?: () => void;
  onToggleFeatured?: () => void;
  onOpenAddons?: () => void;
  onOpenVariations?: () => void;
  onOpenRecommendations?: () => void;
  onOpenTechnicalSheet?: () => void;
  onSaveRecommendations: (payload: MenuRecommendationConfig) => void;
  companyId: string;
  branchId?: string;
  onProductChanged: (product: MenuProduct) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  variationApi: {
    fetch: (input: { companyId: string; branchId?: string; productId: string }) => Promise<MenuProductVariation[]>;
    create: (input: { companyId: string; branchId?: string; productId: string; payload: AdminMenuVariationPayload }) => Promise<MenuProductVariation>;
    update: (input: { companyId: string; branchId?: string; variationId: string; payload: AdminMenuVariationPayload }) => Promise<MenuProductVariation>;
    remove: (input: { companyId: string; branchId?: string; variationId: string }) => Promise<MenuProductVariation>;
  };
  recommendationConfig: MenuRecommendationConfig | null;
  products: MenuProduct[];
  saving: boolean;
  deleting?: boolean;
  actionLoading?: string | null;
}) {
  const title =
    mode === 'create'
      ? 'Novo produto'
      : mode === 'addons'
        ? 'Adicionais e opcionais'
        : mode === 'variations'
          ? 'Variacoes do produto'
          : mode === 'recommendations'
            ? 'Peca tambem'
            : 'Editar produto';
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [categoryName, setCategoryName] = useState(product?.categoryName ?? '');
  const [salePrice, setSalePrice] = useState(String(product?.salePrice ?? product?.price ?? ''));
  const [localPrice, setLocalPrice] = useState(String(product?.localPrice ?? product?.salePrice ?? product?.price ?? ''));
  const [costPrice, setCostPrice] = useState(String(product?.costPrice ?? ''));
  const [deliveryPrice, setDeliveryPrice] = useState(String(product?.deliveryPrice ?? product?.price ?? ''));
  const [promotionalPrice, setPromotionalPrice] = useState(String(product?.promotionalPrice ?? ''));
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(String(product?.prepTimeMinutes ?? ''));
  const [kitchenStation, setKitchenStation] = useState(product?.kitchenStation ?? '');
  const [sortOrder, setSortOrder] = useState(String(product?.sortOrder ?? product?.featuredSortOrder ?? '0'));
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '');
  const [available, setAvailable] = useState(product?.available !== false);
  const [featured, setFeatured] = useState(product?.featured === true);
  const [channels, setChannels] = useState<ProductChannelsState>({
    delivery: product?.channels?.delivery ?? true,
    pdv: product?.channels?.pdv ?? true,
    kiosk: product?.channels?.kiosk ?? true,
    waiter: product?.channels?.waiter ?? true,
  });
  const [recommendationTitle, setRecommendationTitle] = useState(recommendationConfig?.title ?? 'Peca tambem');
  const [recommendationType, setRecommendationType] = useState<MenuRecommendationConfig['type']>(recommendationConfig?.type ?? 'manual');
  const [recommendationLimit, setRecommendationLimit] = useState(String(recommendationConfig?.limit ?? 4));
  const [recommendationActive, setRecommendationActive] = useState(recommendationConfig?.active !== false);
  const [recommendationIds, setRecommendationIds] = useState<string[]>(recommendationConfig?.productIds ?? []);

  useEffect(() => {
    setName(product?.name ?? '');
    setDescription(product?.description ?? '');
    setSku(product?.sku ?? '');
    setCategoryName(product?.categoryName ?? '');
    setSalePrice(String(product?.salePrice ?? product?.price ?? ''));
    setLocalPrice(String(product?.localPrice ?? product?.salePrice ?? product?.price ?? ''));
    setCostPrice(String(product?.costPrice ?? ''));
    setDeliveryPrice(String(product?.deliveryPrice ?? product?.price ?? ''));
    setPromotionalPrice(String(product?.promotionalPrice ?? ''));
    setPrepTimeMinutes(String(product?.prepTimeMinutes ?? ''));
    setKitchenStation(product?.kitchenStation ?? '');
    setSortOrder(String(product?.sortOrder ?? product?.featuredSortOrder ?? '0'));
    setImageUrl(product?.imageUrl ?? '');
    setAvailable(product?.available !== false);
    setFeatured(product?.featured === true);
    setChannels({
      delivery: product?.channels?.delivery ?? true,
      pdv: product?.channels?.pdv ?? true,
      kiosk: product?.channels?.kiosk ?? true,
      waiter: product?.channels?.waiter ?? true,
    });
  }, [product]);

  useEffect(() => {
    if (!recommendationConfig) return;
    setRecommendationTitle(recommendationConfig.title);
    setRecommendationType(recommendationConfig.type);
    setRecommendationLimit(String(recommendationConfig.limit));
    setRecommendationActive(recommendationConfig.active);
    setRecommendationIds(recommendationConfig.productIds ?? []);
  }, [recommendationConfig]);

  const submit = () => {
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      sku: sku.trim() || undefined,
      categoryName: categoryName.trim() || undefined,
      salePrice: Number(salePrice || '0'),
      localPrice: localPrice.trim() ? Number(localPrice) : undefined,
      costPrice: costPrice.trim() ? Number(costPrice) : undefined,
      deliveryPrice: deliveryPrice.trim() ? Number(deliveryPrice) : undefined,
      promotionalPrice: promotionalPrice.trim() ? Number(promotionalPrice) : null,
      prepTimeMinutes: prepTimeMinutes.trim() ? Number(prepTimeMinutes) : undefined,
      kitchenStation: kitchenStation ? (kitchenStation as AdminMenuProductPayload['kitchenStation']) : null,
      sortOrder: sortOrder.trim() ? Number(sortOrder) : 0,
      imageUrl: imageUrl.trim() || undefined,
      available,
      featured,
      channels,
    });
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <Card className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2>{title}</h2>
            <p>{product?.name ?? 'Produto preparado para cadastro no CRUD administrativo.'}</p>
          </div>
          <Button onClick={onClose}>Fechar</Button>
        </div>

        {mode === 'edit' && product ? (
          <ProductConfigPanel
            product={product}
            categoryName={categoryName}
            sku={sku}
            prepTimeMinutes={prepTimeMinutes}
            channels={channels}
            available={available}
            featured={featured}
            saving={saving}
            deleting={deleting}
            actionLoading={actionLoading}
            onToggleAvailability={onToggleAvailability}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onToggleFeatured={onToggleFeatured}
            onOpenAddons={onOpenAddons}
            onOpenVariations={onOpenVariations}
            onOpenRecommendations={onOpenRecommendations}
            onOpenTechnicalSheet={onOpenTechnicalSheet}
          />
        ) : null}

        {mode === 'recommendations' ? (
          <RecommendationsForm
            product={product}
            products={products}
            title={recommendationTitle}
            type={recommendationType}
            limit={recommendationLimit}
            active={recommendationActive}
            ids={recommendationIds}
            onTitleChange={setRecommendationTitle}
            onTypeChange={setRecommendationType}
            onLimitChange={setRecommendationLimit}
            onActiveChange={setRecommendationActive}
            onIdsChange={setRecommendationIds}
          />
        ) : mode === 'addons' ? (
          <AddonGroupsPanel
            product={product}
            products={products}
            companyId={companyId}
            branchId={branchId}
            onProductChanged={onProductChanged}
            onError={onError}
            onNotice={onNotice}
          />
        ) : mode === 'variations' ? (
          <ProductVariationsPanel
            product={product}
            companyId={companyId}
            branchId={branchId}
            variationApi={variationApi}
            onProductChanged={onProductChanged}
            onError={onError}
            onNotice={onNotice}
          />
        ) : (
          <ProductForm
            name={name}
            description={description}
            sku={sku}
            categoryName={categoryName}
            salePrice={salePrice}
            localPrice={localPrice}
            costPrice={costPrice}
            deliveryPrice={deliveryPrice}
            promotionalPrice={promotionalPrice}
            prepTimeMinutes={prepTimeMinutes}
            kitchenStation={kitchenStation}
            sortOrder={sortOrder}
            imageUrl={imageUrl}
            available={available}
            featured={featured}
            channels={channels}
            onNameChange={setName}
            onDescriptionChange={setDescription}
            onSkuChange={setSku}
            onCategoryNameChange={setCategoryName}
            onSalePriceChange={setSalePrice}
            onLocalPriceChange={setLocalPrice}
            onCostPriceChange={setCostPrice}
            onDeliveryPriceChange={setDeliveryPrice}
            onPromotionalPriceChange={setPromotionalPrice}
            onPrepTimeMinutesChange={setPrepTimeMinutes}
            onKitchenStationChange={setKitchenStation}
            onSortOrderChange={setSortOrder}
            onImageUrlChange={setImageUrl}
            onAvailableChange={setAvailable}
            onFeaturedChange={setFeatured}
            onChannelsChange={setChannels}
          />
        )}

        {mode === 'edit' && product ? (
          <AddonGroupsPanel
            product={product}
            products={products}
            companyId={companyId}
            branchId={branchId}
            onProductChanged={onProductChanged}
            onError={onError}
            onNotice={onNotice}
          />
        ) : mode === 'create' ? (
          <Card className={styles.inlinePanel}>
            <strong>Adicionais do produto</strong>
            <span>Salve o produto primeiro para configurar adicionais, variacoes e opcionais.</span>
          </Card>
        ) : null}

        <div className={styles.modalActions}>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (mode === 'recommendations') {
                onSaveRecommendations({
                  title: recommendationTitle,
                  type: recommendationType,
                  limit: Number(recommendationLimit || '4'),
                  active: recommendationActive,
                  productIds: recommendationIds,
                });
                return;
              }
              if (mode === 'addons') {
                onClose();
                return;
              }
              if (mode === 'variations') {
                onClose();
                return;
              }
              submit();
            }}
            disabled={saving}
          >
            {saving ? 'Salvando...' : mode === 'addons' || mode === 'variations' ? 'Fechar' : 'Salvar'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ProductConfigPanel({
  product,
  categoryName,
  sku,
  prepTimeMinutes,
  channels,
  available,
  featured,
  saving,
  deleting,
  actionLoading,
  onToggleAvailability,
  onDuplicate,
  onDelete,
  onToggleFeatured,
  onOpenAddons,
  onOpenVariations,
  onOpenRecommendations,
  onOpenTechnicalSheet,
}: {
  product: MenuProduct;
  categoryName: string;
  sku: string;
  prepTimeMinutes: string;
  channels: ProductChannelsState;
  available: boolean;
  featured: boolean;
  saving: boolean;
  deleting: boolean;
  actionLoading?: string | null;
  onToggleAvailability?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onToggleFeatured?: () => void;
  onOpenAddons?: () => void;
  onOpenVariations?: () => void;
  onOpenRecommendations?: () => void;
  onOpenTechnicalSheet?: () => void;
}) {
  const prepTime = Number(prepTimeMinutes || product.prepTimeMinutes || 0);
  const actionBusy = Boolean(actionLoading) || saving || deleting;
  const toggleLoading = actionLoading === `toggle-${product.id}`;
  const duplicateLoading = actionLoading === `duplicate-${product.id}`;
  const featuredLoading = actionLoading === `featured-${product.id}`;
  const recommendationsLoading = actionLoading === `recommendations-${product.id}`;

  return (
    <section className={styles.productConfigPanel}>
      <div className={styles.productConfigHeader}>
        <div>
          <strong>Configuracao do produto</strong>
          <span>Dados operacionais e atalhos deste item.</span>
        </div>
        <Badge tone={available ? 'success' : 'danger'}>{available ? 'Disponivel' : 'Inativo'}</Badge>
      </div>

      <div className={styles.compactMeta}>
        <span>{categoryName.trim() || product.categoryName || 'Sem categoria'}</span>
        <span>{sku.trim() || product.sku || 'Sem codigo'}</span>
        <span>{prepTime > 0 ? `${prepTime} min` : 'Sem tempo'}</span>
        <span>{product.variations?.length ?? 0} variacoes</span>
        <span>{product.addonGroups?.length ?? 0} grupos</span>
      </div>

      <ChannelBadges channels={channels} />

      <div className={styles.productConfigActions}>
        <Button onClick={onToggleAvailability} disabled={!onToggleAvailability || actionBusy}>
          {toggleLoading ? 'Salvando...' : available ? 'Desativar' : 'Ativar'}
        </Button>
        <Button onClick={onDuplicate} disabled={!onDuplicate || actionBusy}>
          {duplicateLoading ? 'Duplicando...' : 'Duplicar'}
        </Button>
        <Button variant="danger" onClick={onDelete} disabled={!onDelete || actionBusy}>
          {deleting ? 'Excluindo...' : 'Excluir'}
        </Button>
        <Button onClick={onToggleFeatured} disabled={!onToggleFeatured || actionBusy}>
          {featuredLoading ? 'Salvando...' : featured ? 'Remover destaque' : 'Destacar'}
        </Button>
        <Button onClick={onOpenVariations} disabled={!onOpenVariations || actionBusy}>
          Variacoes
        </Button>
        <Button onClick={onOpenAddons} disabled={!onOpenAddons || actionBusy}>
          Editar adicionais
        </Button>
        <Button onClick={onOpenTechnicalSheet} disabled={!onOpenTechnicalSheet || actionBusy}>
          Ficha tecnica
        </Button>
        <Button onClick={onOpenRecommendations} disabled={!onOpenRecommendations || actionBusy}>
          {recommendationsLoading ? 'Carregando...' : 'IA Peca tambem'}
        </Button>
      </div>
    </section>
  );
}

function ProductForm({
  name,
  description,
  sku,
  categoryName,
  salePrice,
  localPrice,
  costPrice,
  deliveryPrice,
  promotionalPrice,
  prepTimeMinutes,
  kitchenStation,
  sortOrder,
  imageUrl,
  available,
  featured,
  channels,
  onNameChange,
  onDescriptionChange,
  onSkuChange,
  onCategoryNameChange,
  onSalePriceChange,
  onLocalPriceChange,
  onCostPriceChange,
  onDeliveryPriceChange,
  onPromotionalPriceChange,
  onPrepTimeMinutesChange,
  onKitchenStationChange,
  onSortOrderChange,
  onImageUrlChange,
  onAvailableChange,
  onFeaturedChange,
  onChannelsChange,
}: {
  name: string;
  description: string;
  sku: string;
  categoryName: string;
  salePrice: string;
  localPrice: string;
  costPrice: string;
  deliveryPrice: string;
  promotionalPrice: string;
  prepTimeMinutes: string;
  kitchenStation: string;
  sortOrder: string;
  imageUrl: string;
  available: boolean;
  featured: boolean;
  channels: ProductChannelsState;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSkuChange: (value: string) => void;
  onCategoryNameChange: (value: string) => void;
  onSalePriceChange: (value: string) => void;
  onLocalPriceChange: (value: string) => void;
  onCostPriceChange: (value: string) => void;
  onDeliveryPriceChange: (value: string) => void;
  onPromotionalPriceChange: (value: string) => void;
  onPrepTimeMinutesChange: (value: string) => void;
  onKitchenStationChange: (value: string) => void;
  onSortOrderChange: (value: string) => void;
  onImageUrlChange: (value: string) => void;
  onAvailableChange: (value: boolean) => void;
  onFeaturedChange: (value: boolean) => void;
  onChannelsChange: (value: ProductChannelsState) => void;
}) {
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  const handleImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!PRODUCT_IMAGE_TYPES.has(file.type)) {
      setImageUploadError('Use uma imagem JPG, PNG ou WebP.');
      event.target.value = '';
      return;
    }

    if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
      setImageUploadError('A imagem deve ter no maximo 5 MB.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setImageUploadError('Nao foi possivel carregar a imagem selecionada.');
        return;
      }
      onImageUrlChange(reader.result);
      setImageUploadError(null);
    };
    reader.onerror = () => setImageUploadError('Nao foi possivel carregar a imagem selecionada.');
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  return (
    <div className={styles.formGrid}>
      <label>
        Nome
        <Input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Ex: Combo Smash" />
      </label>
      <label>
        Categoria
        <Input value={categoryName} onChange={(event) => onCategoryNameChange(event.target.value)} placeholder="Ex: Lanches" />
      </label>
      <label>
        SKU / codigo interno
        <Input value={sku} onChange={(event) => onSkuChange(event.target.value)} placeholder="Ex: BURGER-001" />
      </label>
      <label className={styles.wide}>
        Descricao
        <Input value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="Descricao curta do produto" />
      </label>
      <label>
        Preco venda
        <Input value={salePrice} onChange={(event) => onSalePriceChange(event.target.value)} placeholder="0,00" inputMode="decimal" />
      </label>
      <label>
        Preco local / PDV
        <Input value={localPrice} onChange={(event) => onLocalPriceChange(event.target.value)} placeholder="0,00" inputMode="decimal" />
      </label>
      <label>
        Preco delivery
        <Input value={deliveryPrice} onChange={(event) => onDeliveryPriceChange(event.target.value)} placeholder="0,00" inputMode="decimal" />
      </label>
      <label>
        Preco promocional
        <Input value={promotionalPrice} onChange={(event) => onPromotionalPriceChange(event.target.value)} placeholder="0,00" inputMode="decimal" />
      </label>
      <label>
        Custo estimado
        <Input value={costPrice} onChange={(event) => onCostPriceChange(event.target.value)} placeholder="0,00" inputMode="decimal" />
      </label>
      <label>
        Tempo preparo (min)
        <Input value={prepTimeMinutes} onChange={(event) => onPrepTimeMinutesChange(event.target.value)} placeholder="Ex: 15" inputMode="numeric" />
      </label>
      <label>
        Estacao KDS
        <Select value={kitchenStation} onChange={(event) => onKitchenStationChange(event.target.value)}>
          <option value="">Automatica por canal</option>
          <option value="FRYER">Cozinha quente</option>
          <option value="DRINKS">Bebidas / fria</option>
          <option value="DESSERTS">Sobremesas / fria</option>
          <option value="EXPEDITION">Expedicao</option>
        </Select>
      </label>
      <label>
        Ordem no catalogo
        <Input value={sortOrder} onChange={(event) => onSortOrderChange(event.target.value)} placeholder="0" inputMode="numeric" />
      </label>
      <label>
        Imagem
        <Input value={imageUrl} onChange={(event) => onImageUrlChange(event.target.value)} placeholder="URL da imagem ou selecione uma foto" />
      </label>
      <div className={`${styles.imageUploadPanel} ${styles.wide}`}>
        {imageUrl ? (
          <div className={styles.imagePreview}>
            <img src={imageUrl} alt="Previa da imagem do produto" />
          </div>
        ) : (
          <div className={styles.imagePreviewEmpty}>Sem imagem</div>
        )}
        <div className={styles.imageUploadActions}>
          <label className={styles.filePicker}>
            Importar foto
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageFileChange} />
          </label>
          <Button type="button" onClick={() => onImageUrlChange('')} disabled={!imageUrl}>
            Remover imagem
          </Button>
          <small>JPG, PNG ou WebP ate 5 MB. A imagem importada fica salva no produto.</small>
          {imageUploadError ? <strong>{imageUploadError}</strong> : null}
        </div>
      </div>
      <label>
        Status
        <Select value={available ? 'active' : 'inactive'} onChange={(event) => onAvailableChange(event.target.value === 'active')}>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </Select>
      </label>
      <label className={styles.toggle}>
        <input type="checkbox" checked={featured} onChange={(event) => onFeaturedChange(event.target.checked)} />
        Destaque no cardapio
      </label>

      <div className={styles.wide}>
        <span className={styles.formLabel}>Disponibilidade por canal</span>
        <div className={styles.toggleGrid}>
          {CHANNEL_LABELS.map((channel) => (
            <label key={channel.key} className={styles.toggle}>
              <input
                type="checkbox"
                checked={channels[channel.key] ?? false}
                onChange={(event) => onChannelsChange({ ...channels, [channel.key]: event.target.checked })}
              />
              {channel.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductVariationsPanel({
  product,
  companyId,
  branchId,
  variationApi,
  onProductChanged,
  onError,
  onNotice,
}: {
  product?: MenuProduct;
  companyId: string;
  branchId?: string;
  variationApi: {
    fetch: (input: { companyId: string; branchId?: string; productId: string }) => Promise<MenuProductVariation[]>;
    create: (input: { companyId: string; branchId?: string; productId: string; payload: AdminMenuVariationPayload }) => Promise<MenuProductVariation>;
    update: (input: { companyId: string; branchId?: string; variationId: string; payload: AdminMenuVariationPayload }) => Promise<MenuProductVariation>;
    remove: (input: { companyId: string; branchId?: string; variationId: string }) => Promise<MenuProductVariation>;
  };
  onProductChanged: (product: MenuProduct) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [items, setItems] = useState<MenuProductVariation[]>(product?.variations ?? []);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminMenuVariationPayload>({
    name: '',
    sku: '',
    priceDelta: 0,
    localPriceDelta: 0,
    deliveryPriceDelta: 0,
    sortOrder: 0,
    active: true,
  });

  const syncProduct = (next: MenuProductVariation[]) => {
    if (!product) return;
    onProductChanged({ ...product, variations: next });
  };

  useEffect(() => {
    if (!product?.id) return;
    let active = true;
    setLoading(true);
    variationApi.fetch({ companyId, branchId, productId: product.id })
      .then((next) => {
        if (!active) return;
        setItems(next);
        syncProduct(next);
      })
      .catch((err) => onError(err instanceof Error ? err.message : 'Falha ao carregar variacoes.'))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branchId, companyId, product?.id]);

  if (!product) {
    return <p className={styles.addonSummaryEmpty}>Salve o produto antes de configurar variacoes.</p>;
  }

  const createVariation = async () => {
    setSavingId('new');
    try {
      const created = await variationApi.create({ companyId, branchId, productId: product.id, payload: draft });
      const next = [...items, created].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      setItems(next);
      syncProduct(next);
      setDraft({ name: '', sku: '', priceDelta: 0, localPriceDelta: 0, deliveryPriceDelta: 0, sortOrder: 0, active: true });
      onNotice('Variacao criada.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao criar variacao.');
    } finally {
      setSavingId(null);
    }
  };

  const patchVariation = async (variation: MenuProductVariation, payload: AdminMenuVariationPayload) => {
    setSavingId(variation.id);
    try {
      const updated = await variationApi.update({ companyId, branchId, variationId: variation.id, payload });
      const next = items.map((item) => (item.id === updated.id ? updated : item));
      setItems(next);
      syncProduct(next);
      onNotice('Variacao atualizada.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao atualizar variacao.');
    } finally {
      setSavingId(null);
    }
  };

  const disableVariation = async (variation: MenuProductVariation) => {
    setSavingId(variation.id);
    try {
      const updated = await variationApi.remove({ companyId, branchId, variationId: variation.id });
      const next = items.map((item) => (item.id === updated.id ? updated : item));
      setItems(next);
      syncProduct(next);
      onNotice('Variacao desativada.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao desativar variacao.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className={styles.variationPanel}>
      <div className={styles.formGrid}>
        <label>
          Nome da variacao
          <Input value={draft.name ?? ''} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ex: Grande" />
        </label>
        <label>
          SKU
          <Input value={String(draft.sku ?? '')} onChange={(event) => setDraft({ ...draft, sku: event.target.value })} placeholder="Ex: BURGER-G" />
        </label>
        <label>
          Delta base
          <Input value={String(draft.priceDelta ?? 0)} onChange={(event) => setDraft({ ...draft, priceDelta: Number(event.target.value || 0) })} inputMode="decimal" />
        </label>
        <label>
          Delta local
          <Input value={String(draft.localPriceDelta ?? 0)} onChange={(event) => setDraft({ ...draft, localPriceDelta: Number(event.target.value || 0) })} inputMode="decimal" />
        </label>
        <label>
          Delta delivery
          <Input value={String(draft.deliveryPriceDelta ?? 0)} onChange={(event) => setDraft({ ...draft, deliveryPriceDelta: Number(event.target.value || 0) })} inputMode="decimal" />
        </label>
        <label>
          Ordem
          <Input value={String(draft.sortOrder ?? 0)} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value || 0) })} inputMode="numeric" />
        </label>
      </div>
      <Button variant="primary" onClick={() => void createVariation()} disabled={savingId === 'new'}>
        {savingId === 'new' ? 'Criando...' : 'Criar variacao'}
      </Button>

      {loading ? <p className={styles.addonSummaryEmpty}>Carregando variacoes...</p> : null}
      {!loading && items.length === 0 ? <p className={styles.addonSummaryEmpty}>Nenhuma variacao cadastrada para este produto.</p> : null}
      <div className={styles.variationList}>
        {items.map((variation) => (
          <div key={variation.id} className={styles.variationRow}>
            <div>
              <strong>{variation.name}</strong>
              <span>{variation.sku ?? 'Sem SKU'} | Base +{variation.priceDelta} | Local +{variation.localPriceDelta} | Delivery +{variation.deliveryPriceDelta}</span>
            </div>
            <div className={styles.managementActions}>
              <Button onClick={() => void patchVariation(variation, { active: !variation.active })} disabled={savingId === variation.id}>
                {variation.active ? 'Desativar' : 'Ativar'}
              </Button>
              <Button onClick={() => void disableVariation(variation)} disabled={savingId === variation.id || !variation.active}>
                Remover
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecommendationsForm({
  product,
  products,
  title,
  type,
  limit,
  active,
  ids,
  onTitleChange,
  onTypeChange,
  onLimitChange,
  onActiveChange,
  onIdsChange,
}: {
  product?: MenuProduct;
  products: MenuProduct[];
  title: string;
  type: MenuRecommendationConfig['type'];
  limit: string;
  active: boolean;
  ids: string[];
  onTitleChange: (value: string) => void;
  onTypeChange: (value: MenuRecommendationConfig['type']) => void;
  onLimitChange: (value: string) => void;
  onActiveChange: (value: boolean) => void;
  onIdsChange: (value: string[]) => void;
}) {
  const eligibleProducts = useMemo(() => products.filter((item) => item.id !== product?.id), [product?.id, products]);
  const categories = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number }>();
    eligibleProducts.forEach((item) => {
      const key = item.categoryName || 'Sem categoria';
      const current = map.get(key);
      map.set(key, { key, label: key, count: (current?.count ?? 0) + 1 });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [eligibleProducts]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const activeCategory = selectedCategory || categories[0]?.key || '';
  const visibleProducts = useMemo(
    () => eligibleProducts.filter((item) => (item.categoryName || 'Sem categoria') === activeCategory),
    [activeCategory, eligibleProducts],
  );

  useEffect(() => {
    if (categories.length === 0) {
      if (selectedCategory) setSelectedCategory('');
      return;
    }
    if (!categories.some((item) => item.key === selectedCategory)) {
      setSelectedCategory(categories[0].key);
    }
  }, [categories, selectedCategory]);

  return (
    <div className={styles.formGrid}>
      <label>
        Titulo
        <Input value={title} onChange={(event) => onTitleChange(event.target.value)} />
      </label>
      <label>
        Tipo
        <Select value={type} onChange={(event) => onTypeChange(event.target.value as MenuRecommendationConfig['type'])}>
          <option value="manual">Manual</option>
          <option value="category_related">Relacionados por categoria</option>
          <option value="best_sellers_future">Mais vendidos futuro</option>
        </Select>
      </label>
      <label>
        Limite
        <Input value={limit} onChange={(event) => onLimitChange(event.target.value)} inputMode="numeric" />
      </label>
      <label className={styles.toggle}>
        <input type="checkbox" checked={active} onChange={(event) => onActiveChange(event.target.checked)} />
        Ativo
      </label>
      <div className={styles.wide}>
        <span className={styles.formLabel}>Produtos recomendados</span>
        <div className={styles.recommendationModalGrid}>
          <div className={styles.addonCategoryList}>
            {categories.map((item) => (
              <button
                key={item.key}
                type="button"
                className={item.key === activeCategory ? styles.addonCategoryActive : ''}
                onClick={() => setSelectedCategory(item.key)}
              >
                <span>{item.label}</span>
                <small>{item.count} produto(s)</small>
              </button>
            ))}
          </div>
          <div className={styles.addonProductRows}>
            {visibleProducts.map((item) => (
              <label key={item.id} className={styles.addonProductRow}>
                <input
                  type="checkbox"
                  checked={ids.includes(item.id)}
                  onChange={(event) => onIdsChange(event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))}
                />
                <span>{item.name}</span>
                <small>{item.categoryName ?? 'Sem categoria'}</small>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
