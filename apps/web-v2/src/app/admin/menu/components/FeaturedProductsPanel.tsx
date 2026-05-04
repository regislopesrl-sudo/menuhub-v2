import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { MenuProduct } from '@/features/menu/menu.mock';
import { brl } from '../menu-view-model';
import styles from '../page.module.css';

export function FeaturedProductsPanel({
  products,
  allProducts,
  savingAction,
  onMove,
  onToggleFeatured,
}: {
  products: MenuProduct[];
  allProducts: MenuProduct[];
  savingAction: string | null;
  onMove: (productId: string, direction: -1 | 1) => void;
  onToggleFeatured: (product: MenuProduct) => void;
}) {
  return (
    <section className={styles.simpleGrid}>
      {products.length === 0 ? (
        <>
          <EmptyState title="Sem destaques" description="Marque produtos como destaque para montar esta vitrine." />
          {allProducts.map((product) => (
            <Card key={product.id} className={styles.managementCard}>
              <strong>{product.name}</strong>
              <span>{product.categoryName ?? 'Sem categoria'} | {brl(product.price)}</span>
              <Button variant="primary" onClick={() => onToggleFeatured(product)}>Marcar como destaque</Button>
            </Card>
          ))}
        </>
      ) : null}
      {products.map((product, index) => (
        <Card key={product.id} className={styles.managementCard}>
          <strong>{index + 1}. {product.name}</strong>
          <span>{product.categoryName ?? 'Sem categoria'} | {brl(product.price)}</span>
          <Badge tone="warning">Destaque</Badge>
          <div className={styles.actions}>
            <Button disabled={index === 0 || savingAction === 'reorder-featured'} onClick={() => onMove(product.id, -1)}>Subir</Button>
            <Button disabled={index === products.length - 1 || savingAction === 'reorder-featured'} onClick={() => onMove(product.id, 1)}>Descer</Button>
            <Button onClick={() => onToggleFeatured(product)}>Remover destaque</Button>
          </div>
        </Card>
      ))}
    </section>
  );
}
