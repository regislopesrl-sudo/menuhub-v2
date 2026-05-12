import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { MenuProduct } from '@/features/menu/menu.mock';
import styles from '../page.module.css';

type RecommendationCategoryRow = {
  key: string;
  label: string;
  count: number;
};

export function RecommendationsPanel({
  products,
  onOpenRecommendations,
}: {
  products: MenuProduct[];
  onOpenRecommendations: (product: MenuProduct) => void;
}) {
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
    return <EmptyState title="Sem produtos" description="Cadastre produtos antes de configurar o Peca tambem." />;
  }

  return (
    <section className={styles.recommendationsHub}>
      <Card className={styles.addonsHubHero}>
        <div>
          <span>Peça também</span>
          <strong>Configure recomendações por produto.</strong>
          <p>Escolha uma categoria, abra o produto e selecione quais itens devem aparecer para o cliente.</p>
        </div>
        <div className={styles.addonsHubMetrics}>
          <Badge>{categories.length} categorias</Badge>
          <Badge>{products.filter((product) => product.recommendations?.active).length} configurados</Badge>
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
          <strong>Produtos da categoria</strong>
          <div className={styles.addonProductRows}>
            {visibleProducts.map((product) => {
              const active = product.recommendations?.active === true && (product.recommendations.productIds ?? []).length > 0;
              return (
                <label key={product.id} className={styles.recommendationProductRow}>
                  <input
                    type="checkbox"
                    checked={active}
                    readOnly
                    onClick={(event) => {
                      event.preventDefault();
                      onOpenRecommendations(product);
                    }}
                  />
                  <span>{product.name}</span>
                  <small>
                    {product.categoryName ?? 'Sem categoria'} | {(product.recommendations?.productIds ?? []).length} item(ns) selecionado(s)
                  </small>
                  <Button onClick={() => onOpenRecommendations(product)}>Configurar</Button>
                </label>
              );
            })}
          </div>
        </Card>
      </div>
    </section>
  );
}
