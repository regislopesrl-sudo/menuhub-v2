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
  onToggle,
  onDuplicate,
  onFeatured,
  onRecommendations,
  actionLoading,
}: {
  product: MenuProduct;
  onEdit: () => void;
  onAddons: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onFeatured: () => void;
  onRecommendations: () => void;
  actionLoading: string | null;
}) {
  const hasImage = Boolean(product.imageUrl);
  const addonCount = (product.addonGroups ?? []).length;

  return (
    <Card className={`${styles.productCard} ${product.available === false ? styles.productInactive : ''}`.trim()}>
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

        <div className={styles.pricePanel}>
          <div>
            <span>Base</span>
            <strong>{brl(product.salePrice ?? product.price)}</strong>
          </div>
          <div>
            <span>Delivery</span>
            <strong>{brl(product.deliveryPrice ?? product.price)}</strong>
          </div>
          <div>
            <span>Promo</span>
            <strong>{product.promotionalPrice ? brl(product.promotionalPrice) : '-'}</strong>
          </div>
        </div>

        <ChannelBadges channels={product.channels} />

        <div className={styles.cardFooter}>
          <Badge>{product.categoryName ?? 'Sem categoria'}</Badge>
          <Badge tone={addonCount > 0 ? 'warning' : 'default'}>{addonCount} grupos</Badge>
        </div>

        <AddonSummary product={product} />

        <div className={styles.actions}>
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
          <Button onClick={onAddons}>Adicionais</Button>
          <Button onClick={onRecommendations}>Peca tambem</Button>
        </div>
      </div>
    </Card>
  );
}

function AddonSummary({ product }: { product: MenuProduct }) {
  const groups = product.addonGroups ?? [];

  if (groups.length === 0) {
    return <p className={styles.addonSummaryEmpty}>Sem grupos de adicionais configurados.</p>;
  }

  return (
    <div className={styles.addonSummary}>
      {groups.slice(0, 2).map((group) => (
        <div key={group.id}>
          <strong>{group.name}</strong>
          <span>
            {group.required ? 'Obrigatorio' : 'Opcional'} | {group.minSelect}-{group.maxSelect} | {(group.options ?? []).length} opcoes
          </span>
        </div>
      ))}
      {groups.length > 2 ? <small>+ {groups.length - 2} grupos adicionais</small> : null}
    </div>
  );
}
