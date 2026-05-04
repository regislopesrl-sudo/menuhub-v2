import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { MenuProduct } from '@/features/menu/menu.mock';
import styles from '../page.module.css';

export function RecommendationsPanel({
  products,
  onOpenRecommendations,
}: {
  products: MenuProduct[];
  onOpenRecommendations: (product: MenuProduct) => void;
}) {
  if (products.length === 0) {
    return <EmptyState title="Sem produtos" description="Cadastre produtos antes de configurar o Peca tambem." />;
  }

  const productNames = new Map(products.map((product) => [product.id, product.name]));

  return (
    <section className={styles.simpleGrid}>
      {products.map((product) => (
        <Card key={product.id} className={styles.managementCard}>
          <strong>{product.name}</strong>
          <span>{product.recommendations?.active ? `${product.recommendations.title} ativo` : 'Sem recomendacoes configuradas'}</span>
          {product.recommendations?.productIds?.length ? (
            <span>
              Relacionados: {product.recommendations.productIds.map((id) => productNames.get(id)).filter(Boolean).join(', ')}
            </span>
          ) : null}
          <Button variant="primary" onClick={() => onOpenRecommendations(product)}>Configurar Peca tambem</Button>
        </Card>
      ))}
    </section>
  );
}
