import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { getSmartMenuRecommendations } from '@/features/menu/menu-recommendations';
import type { MenuProduct } from '@/features/menu/menu.mock';
import { brl } from '../menu-view-model';
import styles from '../page.module.css';

type RecommendationCategoryRow = {
  key: string;
  label: string;
  count: number;
};

export function RecommendationsPanel({ products }: { products: MenuProduct[] }) {
  const [selectedCategory, setSelectedCategory] = useState('');

  const categories = useMemo<RecommendationCategoryRow[]>(() => {
    const map = new Map<string, RecommendationCategoryRow>();
    products.forEach((product) => {
      const key = product.categoryName || 'Sem categoria';
      const current = map.get(key);
      map.set(key, { key, label: key, count: (current?.count ?? 0) + 1 });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);

  const activeCategory = selectedCategory || categories[0]?.key || '';

  useEffect(() => {
    if (categories.length === 0) {
      if (selectedCategory) setSelectedCategory('');
      return;
    }
    if (!categories.some((item) => item.key === selectedCategory)) {
      setSelectedCategory(categories[0].key);
    }
  }, [categories, selectedCategory]);

  const visibleProducts = useMemo(() => {
    if (!activeCategory) return [];
    return products.filter((product) => (product.categoryName || 'Sem categoria') === activeCategory);
  }, [activeCategory, products]);

  if (products.length === 0) {
    return <EmptyState title="Sem produtos" description="Cadastre produtos para a IA montar o Peca tambem." />;
  }

  return (
    <section className={styles.recommendationsHub}>
      <Card className={styles.addonsHubHero}>
        <div>
          <span>Peça também</span>
          <strong>IA automática de recomendações.</strong>
          <p>
            O sistema escolhe sozinho os produtos que combinam com a sacola do cliente, considerando categoria,
            preço, destaque, disponibilidade e relação entre itens.
          </p>
        </div>
        <div className={styles.addonsHubMetrics}>
          <Badge>IA ativa</Badge>
          <Badge>{products.filter((product) => product.available !== false).length} produtos elegiveis</Badge>
        </div>
      </Card>

      <div className={styles.addonProductMatrix}>
        <Card className={styles.addonCategoryColumn}>
          <strong>Categorias</strong>
          <div className={styles.addonCategoryList}>
            {categories.map((item) => (
              <button
                key={item.key}
                type="button"
                className={item.key === activeCategory ? styles.addonCategoryActive : ''}
                onClick={() => setSelectedCategory(item.key)}
              >
                <span>{item.label}</span>
                <Badge>{item.count}</Badge>
              </button>
            ))}
          </div>
        </Card>

        <Card className={styles.addonProductsColumn}>
          <strong>Prévia da IA por produto</strong>
          <div className={styles.addonProductRows}>
            {visibleProducts.map((product) => {
              const suggestions = getSmartMenuRecommendations(products, { sourceProductId: product.id, limit: 4 });
              return (
                <div key={product.id} className={styles.recommendationProductRow}>
                  <span>{product.name}</span>
                  <small>
                    {suggestions.length > 0
                      ? suggestions.map((item) => item.name).join(' | ')
                      : 'Sem sugestoes automaticas disponiveis'}
                  </small>
                  <Badge>{suggestions.length} IA</Badge>
                  {suggestions[0] ? <strong>{brl(suggestions[0].deliveryPrice ?? suggestions[0].price)}</strong> : null}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </section>
  );
}
