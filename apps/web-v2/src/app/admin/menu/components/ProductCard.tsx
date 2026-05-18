import type { KeyboardEvent } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import type { MenuProduct } from '@/features/menu/menu.mock';
import styles from '../page.module.css';

export function ProductCard({
  product,
  onEdit,
}: {
  product: MenuProduct;
  onEdit: () => void;
}) {
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
      <div className={styles.productBody}>
        <div className={styles.productTop}>
          <div>
            <h2>{product.name}</h2>
            <p>{product.categoryName ?? 'Sem categoria'}</p>
          </div>
          <Badge tone={product.available === false ? 'danger' : 'success'}>
            {product.available === false ? 'Inativo' : 'Disponivel'}
          </Badge>
        </div>
      </div>
    </Card>
  );
}
