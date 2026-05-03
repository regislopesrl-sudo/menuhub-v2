import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import type { AdminMenuProductPayload } from '@/features/menu/menu.api';
import type { MenuProduct, MenuRecommendationConfig } from '@/features/menu/menu.mock';
import { CHANNEL_LABELS, type ModalMode } from '../menu-view-model';
import styles from '../page.module.css';
import { AddonGroupsPanel } from './AddonGroupsPanel';

type ProductChannelsState = {
  delivery: boolean;
  pdv: boolean;
  kiosk: boolean;
  waiter: boolean;
};

export function ProductModal({
  mode,
  product,
  onClose,
  onSave,
  onSaveRecommendations,
  companyId,
  branchId,
  onProductChanged,
  onError,
  onNotice,
  recommendationConfig,
  products,
  saving,
}: {
  mode: ModalMode;
  product?: MenuProduct;
  onClose: () => void;
  onSave: (payload: AdminMenuProductPayload) => void;
  onSaveRecommendations: (payload: MenuRecommendationConfig) => void;
  companyId: string;
  branchId?: string;
  onProductChanged: (product: MenuProduct) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  recommendationConfig: MenuRecommendationConfig | null;
  products: MenuProduct[];
  saving: boolean;
}) {
  const title = mode === 'create' ? 'Novo produto' : mode === 'addons' ? 'Adicionais e opcionais' : mode === 'recommendations' ? 'Peca tambem' : 'Editar produto';
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [categoryName, setCategoryName] = useState(product?.categoryName ?? '');
  const [salePrice, setSalePrice] = useState(String(product?.salePrice ?? product?.price ?? ''));
  const [deliveryPrice, setDeliveryPrice] = useState(String(product?.deliveryPrice ?? product?.price ?? ''));
  const [promotionalPrice, setPromotionalPrice] = useState(String(product?.promotionalPrice ?? ''));
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '');
  const [available, setAvailable] = useState(product?.available !== false);
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
      categoryName: categoryName.trim() || undefined,
      salePrice: Number(salePrice || '0'),
      deliveryPrice: deliveryPrice.trim() ? Number(deliveryPrice) : undefined,
      promotionalPrice: promotionalPrice.trim() ? Number(promotionalPrice) : null,
      imageUrl: imageUrl.trim() || undefined,
      available,
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
            companyId={companyId}
            branchId={branchId}
            onProductChanged={onProductChanged}
            onError={onError}
            onNotice={onNotice}
          />
        ) : (
          <ProductForm
            name={name}
            description={description}
            categoryName={categoryName}
            salePrice={salePrice}
            deliveryPrice={deliveryPrice}
            promotionalPrice={promotionalPrice}
            imageUrl={imageUrl}
            available={available}
            channels={channels}
            onNameChange={setName}
            onDescriptionChange={setDescription}
            onCategoryNameChange={setCategoryName}
            onSalePriceChange={setSalePrice}
            onDeliveryPriceChange={setDeliveryPrice}
            onPromotionalPriceChange={setPromotionalPrice}
            onImageUrlChange={setImageUrl}
            onAvailableChange={setAvailable}
            onChannelsChange={setChannels}
          />
        )}

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
              submit();
            }}
            disabled={saving}
          >
            {saving ? 'Salvando...' : mode === 'addons' ? 'Fechar adicionais' : 'Salvar'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ProductForm({
  name,
  description,
  categoryName,
  salePrice,
  deliveryPrice,
  promotionalPrice,
  imageUrl,
  available,
  channels,
  onNameChange,
  onDescriptionChange,
  onCategoryNameChange,
  onSalePriceChange,
  onDeliveryPriceChange,
  onPromotionalPriceChange,
  onImageUrlChange,
  onAvailableChange,
  onChannelsChange,
}: {
  name: string;
  description: string;
  categoryName: string;
  salePrice: string;
  deliveryPrice: string;
  promotionalPrice: string;
  imageUrl: string;
  available: boolean;
  channels: ProductChannelsState;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCategoryNameChange: (value: string) => void;
  onSalePriceChange: (value: string) => void;
  onDeliveryPriceChange: (value: string) => void;
  onPromotionalPriceChange: (value: string) => void;
  onImageUrlChange: (value: string) => void;
  onAvailableChange: (value: boolean) => void;
  onChannelsChange: (value: ProductChannelsState) => void;
}) {
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
      <label className={styles.wide}>
        Descricao
        <Input value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="Descricao curta do produto" />
      </label>
      <label>
        Preco venda
        <Input value={salePrice} onChange={(event) => onSalePriceChange(event.target.value)} placeholder="0,00" inputMode="decimal" />
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
        Imagem
        <Input value={imageUrl} onChange={(event) => onImageUrlChange(event.target.value)} placeholder="URL da imagem" />
      </label>
      <label>
        Status
        <Select value={available ? 'active' : 'inactive'} onChange={(event) => onAvailableChange(event.target.value === 'active')}>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </Select>
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
        <div className={styles.recommendationPicker}>
          {products.filter((item) => item.id !== product?.id).map((item) => (
            <label key={item.id}>
              <input
                type="checkbox"
                checked={ids.includes(item.id)}
                onChange={(event) => onIdsChange(event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))}
              />
              {item.name}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
