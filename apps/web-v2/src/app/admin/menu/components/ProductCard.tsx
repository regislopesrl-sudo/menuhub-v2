import type { KeyboardEvent, MouseEvent } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { MenuProduct } from '@/features/menu/menu.mock';
import { brl } from '../menu-view-model';
import styles from '../page.module.css';
import { ChannelBadges } from './ChannelBadges';

export function ProductCard({
  product,
  onEdit,
  onAddons,
  onVariations,
  onToggle,
  onDuplicate,
  onFeatured,
  onRecommendations,
  actionLoading,
}: {
  product: MenuProduct;
  onEdit: () => void;
  onAddons: () => void;
  onVariations: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onFeatured: () => void;
  onRecommendations: () => void;
  actionLoading: string | null;
}) {
  const hasImage = Boolean(product.imageUrl);
  const addonCount = (product.addonGroups ?? []).length;
  const basePrice = product.salePrice ?? product.price;
  const costPrice = product.costPrice ?? 0;
  const margin = basePrice > 0 ? ((basePrice - costPrice) / basePrice) * 100 : null;
  const stopActionClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };
  const stopActionKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onEdit();
    }
  };

  return (
    <Card
      className={`${styles.productCard} ${product.available === false ? styles.productInactive : ''}`.trim()}
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={handleKeyDown}
      aria-label={`Abrir configuracao do produto ${product.name}`}
    >
      <div className={styles.productMedia}>
        {hasImage ? <img src={product.imageUrl} alt={product.name} /> : <span>{product.name.slice(0, 2).toUpperCase()}</span>}
      </div>
      <div className={styles.productBody}>
        <div className={styles.productTop}>
          <div>
            <h2>{product.name}</h2>
            <p>{product.description || 'Produto sem descricao cadastrada.'}</p>
          </div>
          <Badge tone={product.available === false ? 'danger' : 'success'}>
            {product.available === false ? 'Inativo' : 'Disponivel'}
          </Badge>
        </div>

        <div className={styles.pricePanel} aria-label="Resumo financeiro do produto">
          <div>
            <span>Base</span>
            <strong>{brl(basePrice)}</strong>
          </div>
          <div>
            <span>Local / PDV</span>
            <strong>{brl(product.localPrice ?? basePrice)}</strong>
          </div>
          <div>
            <span>Delivery</span>
            <strong>{brl(product.deliveryPrice ?? product.price)}</strong>
          </div>
          <div>
            <span>Promo</span>
            <strong>{product.promotionalPrice ? brl(product.promotionalPrice) : '-'}</strong>
          </div>
          <div>
            <span>Custo</span>
            <strong>{costPrice > 0 ? brl(costPrice) : '-'}</strong>
          </div>
          <div>
            <span>Margem</span>
            <strong>{margin === null ? '-' : `${margin.toFixed(1)}%`}</strong>
          </div>
        </div>

        <div className={styles.compactMeta}>
          <span>{product.categoryName ?? 'Sem categoria'}</span>
          {product.sku ? <span>{product.sku}</span> : null}
          <span>{product.prepTimeMinutes ? `${product.prepTimeMinutes} min` : 'Sem tempo'}</span>
          <span>{(product.variations ?? []).length} variacoes</span>
          <span>{addonCount} grupos</span>
        </div>

        <ChannelBadges channels={product.channels} />

        <div className={styles.actions} onClick={stopActionClick} onKeyDown={stopActionKeyDown}>
          <Button variant="primary" onClick={onEdit}>Editar</Button>
          <Button onClick={onToggle} disabled={actionLoading === `toggle-${product.id}`}>
            {actionLoading === `toggle-${product.id}` ? 'Salvando...' : product.available === false ? 'Ativar' : 'Desativar'}
          </Button>
          <Button onClick={onDuplicate} disabled={actionLoading === `duplicate-${product.id}`}>
            {actionLoading === `duplicate-${product.id}` ? 'Duplicando...' : 'Duplicar'}
          </Button>
          <Button onClick={onFeatured} disabled={actionLoading === `featured-${product.id}`}>
            {product.featured ? 'Remover destaque' : 'Destacar'}
          </Button>
          <Button onClick={onVariations}>Variacoes</Button>
          <Button onClick={onAddons}>Editar adicionais</Button>
          <Button onClick={onRecommendations}>Peca tambem</Button>
        </div>
      </div>
    </Card>
  );
}
