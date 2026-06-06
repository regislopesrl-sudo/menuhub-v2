import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { MenuProduct } from '@/features/menu/menu.mock';
import styles from '../page.module.css';

const STORAGE_KEY = 'menuhub:smart-recommendations-enabled';

export function RecommendationsPanel({ products }: { products: MenuProduct[] }) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'false') setEnabled(false);
  }, []);

  const eligibleProducts = useMemo(
    () => products.filter((product) => product.available !== false && product.channels?.delivery !== false),
    [products],
  );

  const toggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
  };

  if (products.length === 0) {
    return <EmptyState title="Sem produtos" description="Cadastre produtos para a IA montar o Peca tambem." />;
  }

  return (
    <section className={styles.recommendationsHub}>
      <Card className={styles.aiRecommendationPanel}>
        <div>
          <span>Peca tambem</span>
          <strong>Recomendacoes automaticas por inteligencia artificial</strong>
          <p>
            A IA escolhe sozinha os itens exibidos ao cliente de acordo com a sacola, categoria, disponibilidade,
            destaque, preco e relacao entre produtos. Nao e necessario selecionar produto ou categoria manualmente.
          </p>
        </div>

        <div className={styles.aiRecommendationStatus}>
          <Badge tone={enabled ? 'success' : 'warning'}>{enabled ? 'IA ativa' : 'IA desativada'}</Badge>
          <Badge>{eligibleProducts.length} produtos elegiveis</Badge>
          <Button variant={enabled ? 'danger' : 'primary'} onClick={toggleEnabled}>
            {enabled ? 'Desativar Peca tambem' : 'Ativar Peca tambem'}
          </Button>
        </div>
      </Card>

      <Card className={styles.aiRecommendationRules}>
        <strong>Como o sistema decide</strong>
        <div>
          <span>1</span>
          <p>Remove produtos indisponiveis e o que ja esta na sacola.</p>
        </div>
        <div>
          <span>2</span>
          <p>Prioriza combinacoes naturais: bebida, sobremesa, porcao, adicionais e itens da mesma linha.</p>
        </div>
        <div>
          <span>3</span>
          <p>Ordena por relevancia, destaque, preco e historico de configuracao do catalogo.</p>
        </div>
      </Card>
    </section>
  );
}
