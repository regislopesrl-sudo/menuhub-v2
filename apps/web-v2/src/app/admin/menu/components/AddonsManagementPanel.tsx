import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { MenuProduct } from '@/features/menu/menu.mock';
import styles from '../page.module.css';

export function AddonsManagementPanel({
  products,
  onOpenAddons,
}: {
  products: MenuProduct[];
  onOpenAddons: (product: MenuProduct) => void;
}) {
  if (products.length === 0) {
    return <EmptyState title="Nenhum produto cadastrado" description="Cadastre um produto antes de configurar adicionais." />;
  }

  return (
    <section className={styles.simpleGrid}>
      {products.map((product) => (
        <Card key={product.id} className={styles.managementCard}>
          <strong>{product.name}</strong>
          <span>{(product.addonGroups ?? []).length} grupos de adicionais configurados</span>
          <Button variant="primary" onClick={() => onOpenAddons(product)}>Gerenciar adicionais</Button>
        </Card>
      ))}
    </section>
  );
}
