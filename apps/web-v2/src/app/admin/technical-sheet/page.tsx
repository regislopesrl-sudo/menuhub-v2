'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { fetchAdminMenu, getMenuFallback } from '@/features/menu/menu.api';
import type { MenuProduct } from '@/features/menu/menu.mock';
import { listStockProductAvailability, type StockProductAvailability } from '@/features/stock/stock.api';
import styles from './page.module.css';

type ProductTechnicalRow = {
  product: MenuProduct;
  availability?: StockProductAvailability;
};

const KITCHEN_STATION_LABELS: Record<string, string> = {
  FRYER: 'Fritadeira',
  DRINKS: 'Bar',
  DESSERTS: 'Sobremesas',
  EXPEDITION: 'Expedicao',
};

function brl(value: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
  return `${Number(value).toFixed(1)}%`;
}

function normalize(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function productCode(product: MenuProduct) {
  return product.sku?.trim() || product.id.slice(0, 8);
}

function productSector(product: MenuProduct) {
  return product.kitchenStation ? KITCHEN_STATION_LABELS[product.kitchenStation] ?? product.kitchenStation : 'Geral';
}

function technicalStatus(row: ProductTechnicalRow) {
  const status = row.availability?.availabilityStatus ?? row.product.stockAvailabilityStatus;
  if (row.product.controlsStock === false || status === 'not_controlled') {
    return { label: 'Sem controle', tone: 'default' as const, note: 'Produto nao controla estoque.' };
  }
  if (row.availability?.recipeId && (row.availability.ingredients?.length ?? 0) > 0) {
    return { label: 'Ficha OK', tone: 'success' as const, note: 'Formula vinculada ao produto.' };
  }
  if (row.availability?.recipeId) {
    return { label: 'Sem baixa', tone: 'warning' as const, note: 'Ficha sem insumos que baixam estoque.' };
  }
  return { label: 'Sem ficha', tone: 'danger' as const, note: 'Criar ou vincular ficha tecnica.' };
}

export default function TechnicalSheetIndexPage() {
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [availability, setAvailability] = useState<StockProductAvailability[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [menuData, availabilityData] = await Promise.all([
          fetchAdminMenu({ companyId, branchId }).catch(() => getMenuFallback()),
          listStockProductAvailability().catch(() => []),
        ]);
        if (!active) return;
        setProducts((Array.isArray(menuData) ? menuData : []).filter((product) => product.type !== 'combo'));
        setAvailability(Array.isArray(availabilityData) ? availabilityData : []);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar fichas tecnicas.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [branchId, companyId]);

  const rows = useMemo<ProductTechnicalRow[]>(() => {
    const availabilityByProduct = new Map(availability.map((item) => [item.productId, item] as const));
    return products
      .map((product) => ({ product, availability: availabilityByProduct.get(product.id) }))
      .sort((left, right) => (left.product.categoryName ?? '').localeCompare(right.product.categoryName ?? '') || left.product.name.localeCompare(right.product.name));
  }, [availability, products]);

  const filteredRows = useMemo(() => {
    const search = normalize(query);
    if (!search) return rows;
    return rows.filter((row) => {
      const status = technicalStatus(row);
      return normalize(`${row.product.name} ${row.product.categoryName ?? ''} ${productCode(row.product)} ${row.availability?.recipe?.name ?? ''} ${status.label}`).includes(search);
    });
  }, [query, rows]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const status = technicalStatus(row).label;
        acc.total += 1;
        if (status === 'Ficha OK') acc.ok += 1;
        if (status === 'Sem ficha') acc.missing += 1;
        if (status === 'Sem baixa') acc.withoutStock += 1;
        return acc;
      },
      { total: 0, ok: 0, missing: 0, withoutStock: 0 },
    );
  }, [rows]);

  if (loading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Carregando fichas tecnicas..." />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="Ficha Tecnica"
        subtitle="Formulacao de produtos"
        right={
          <Link href="/admin/menu?tab=products">
            <Button>Produtos</Button>
          </Link>
        }
      />

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.metrics} aria-label="Resumo de fichas tecnicas">
        <Card className={styles.metric}>
          <span>Produtos</span>
          <strong>{summary.total}</strong>
          <small>Itens vendidos ou prontos para venda</small>
        </Card>
        <Card className={styles.metric}>
          <span>Com ficha</span>
          <strong>{summary.ok}</strong>
          <small>Calculam custo e baixa tecnica</small>
        </Card>
        <Card className={styles.metric}>
          <span>Sem ficha</span>
          <strong>{summary.missing}</strong>
          <small>Exigem formulacao</small>
        </Card>
        <Card className={styles.metric}>
          <span>Sem baixa</span>
          <strong>{summary.withoutStock}</strong>
          <small>Ficha sem insumos de estoque</small>
        </Card>
      </section>

      <section className={styles.dataPanel}>
        <header className={styles.dataHeader}>
          <div>
            <span>10_FICHA_TECNICA</span>
            <h2>Ficha Tecnica</h2>
            <p>Produtos, formulacao, custo de ficha e pendencias tecnicas.</p>
          </div>
          <label>
            <span>Buscar</span>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Produto, categoria, SKU..." />
          </label>
        </header>

        <div className={styles.recordCount}>{filteredRows.length} registros carregados</div>

        {filteredRows.length === 0 ? (
          <EmptyState title="Nenhuma ficha encontrada" description="Ajuste a busca ou cadastre produtos no cardapio." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Prato/Produto</th>
                  <th>Setor</th>
                  <th>Categoria</th>
                  <th>Qtd. componentes</th>
                  <th>Formulacao</th>
                  <th>Custo ficha (R$)</th>
                  <th>Margem</th>
                  <th>Status</th>
                  <th>Obs.</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const status = technicalStatus(row);
                  const ingredientCount = row.availability?.ingredients?.length ?? 0;
                  return (
                    <tr key={row.product.id}>
                      <td>{productCode(row.product)}</td>
                      <td>
                        <Link className={styles.primaryLink} href={`/admin/technical-sheet/${row.product.id}`}>
                          {row.product.name}
                        </Link>
                      </td>
                      <td>{productSector(row.product)}</td>
                      <td>{row.product.categoryName ?? 'Sem categoria'}</td>
                      <td>{ingredientCount}</td>
                      <td>{row.availability?.recipe?.name ?? (row.availability?.recipeId ? 'Ficha vinculada' : 'Sem ficha tecnica')}</td>
                      <td>{brl(row.availability?.technicalCost ?? row.product.costPrice ?? 0)}</td>
                      <td>{percent(row.availability?.grossMarginPercent)}</td>
                      <td><Badge tone={status.tone}>{status.label}</Badge></td>
                      <td>{status.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
