'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  createStockItem,
  listStockItems,
  listStockMovements,
  stockManualEntry,
  stockManualExit,
  applyInventoryCounts,
  type StockItem,
  type StockMovement,
} from '@/features/stock/stock.api';
import styles from './page.module.css';

export default function AdminStockPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [itemName, setItemName] = useState('');
  const [itemUnit, setItemUnit] = useState('un');
  const [itemCost, setItemCost] = useState('0');

  const [selectedItemId, setSelectedItemId] = useState('');
  const [moveQty, setMoveQty] = useState('');
  const [moveCost, setMoveCost] = useState('0');
  const [moveReason, setMoveReason] = useState('manual');
  const [countedQty, setCountedQty] = useState('');

  const selected = useMemo(() => items.find((it) => it.id === selectedItemId) ?? null, [items, selectedItemId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [stockItems, stockMovements] = await Promise.all([listStockItems(), listStockMovements()]);
      setItems(stockItems);
      setMovements(stockMovements);
      if (!selectedItemId && stockItems[0]?.id) setSelectedItemId(stockItems[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar estoque.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreateItem(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await createStockItem({
        name: itemName,
        stockUnit: itemUnit,
        purchaseUnit: itemUnit,
        averageCost: Number(itemCost || '0'),
      });
      setItems((prev) => [created, ...prev]);
      setSelectedItemId(created.id);
      setItemName('');
      setNotice('Item de estoque criado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar item.');
    } finally {
      setSaving(false);
    }
  }

  async function submitMovement(type: 'entry' | 'exit') {
    if (!selectedItemId) {
      setError('Selecione um item.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        stockItemId: selectedItemId,
        quantity: Number(moveQty || '0'),
        unitCost: Number(moveCost || '0'),
        reasonCode: moveReason,
      };
      const result = type === 'entry' ? await stockManualEntry(payload) : await stockManualExit(payload);
      setItems((prev) => prev.map((it) => (it.id === result.item.id ? { ...it, ...result.item } : it)));
      setMovements((prev) => [result.movement, ...prev]);
      setMoveQty('');
      setNotice(type === 'entry' ? 'Entrada manual registrada.' : 'Saida manual registrada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar movimentacao.');
    } finally {
      setSaving(false);
    }
  }

  async function submitInventoryCount() {
    if (!selectedItemId) {
      setError('Selecione um item.');
      return;
    }
    const counted = Number(countedQty || '0');
    if (!Number.isFinite(counted) || counted < 0) {
      setError('Quantidade contada invalida.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await applyInventoryCounts({
        counts: [{ stockItemId: selectedItemId, countedQuantity: counted, reasonCode: 'inventory_count' }],
      });
      await load();
      setNotice('Inventario aplicado com sucesso.');
      setCountedQty('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aplicar inventario.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className={styles.page}><LoadingState label="Carregando estoque..." /></main>;

  return (
    <main className={styles.page}>
      <PageHeader
        title="Estoque"
        subtitle="Controle base de itens e movimentacoes manuais"
        right={<Button onClick={() => void load()}>Atualizar</Button>}
      />

      {error ? <Card className={styles.card}><Badge tone="danger">Erro</Badge><span>{error}</span></Card> : null}
      {notice ? <Card className={styles.card}><Badge tone="success">OK</Badge><span>{notice}</span></Card> : null}

      <section className={styles.grid}>
        <Card className={styles.card}>
          <h2>Cadastrar item</h2>
          <form onSubmit={(e) => void onCreateItem(e)} className={styles.formRow}>
            <Input placeholder="Nome do item" value={itemName} onChange={(e) => setItemName(e.target.value)} />
            <Input placeholder="Unidade" value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} />
            <Input placeholder="Custo medio" value={itemCost} onChange={(e) => setItemCost(e.target.value)} />
            <Button type="submit" disabled={saving}>Criar</Button>
          </form>

          <div className={styles.itemsList}>
            {items.length === 0 ? <EmptyState title="Sem itens" description="Cadastre o primeiro item de estoque." /> : null}
            {items.map((item) => (
              <button key={item.id} className={styles.row} onClick={() => setSelectedItemId(item.id)} type="button">
                <strong>{item.name}</strong>
                <div className={styles.meta}>
                  <span>Qtd atual: {Number(item.currentQuantity).toFixed(3)} {item.stockUnit ?? 'un'}</span>
                  <span>Min: {Number(item.minimumQuantity).toFixed(3)}</span>
                  <span>Custo: R$ {Number(item.averageCost).toFixed(2)}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className={styles.card}>
          <h2>Entrada / Saida manual</h2>
          <div className={styles.formRow}>
            <Input placeholder="Item selecionado" value={selected?.name ?? ''} readOnly />
            <Input placeholder="Quantidade" value={moveQty} onChange={(e) => setMoveQty(e.target.value)} />
            <Input placeholder="Custo unitario" value={moveCost} onChange={(e) => setMoveCost(e.target.value)} />
            <Input placeholder="Motivo" value={moveReason} onChange={(e) => setMoveReason(e.target.value)} />
          </div>
          <div className={styles.actions}>
            <Button disabled={saving || !selectedItemId} onClick={() => void submitMovement('entry')}>Entrada manual</Button>
            <Button variant="danger" disabled={saving || !selectedItemId} onClick={() => void submitMovement('exit')}>Saida manual</Button>
          </div>
          <div className={styles.formRow}>
            <Input placeholder="Quantidade contada (inventario)" value={countedQty} onChange={(e) => setCountedQty(e.target.value)} />
            <Button disabled={saving || !selectedItemId} onClick={() => void submitInventoryCount()}>
              Aplicar inventario
            </Button>
          </div>

          <h3>Ultimas movimentacoes</h3>
          <div className={styles.movementsList}>
            {movements.length === 0 ? <EmptyState title="Sem movimentacoes" /> : null}
            {movements.map((mv) => (
              <div key={mv.id} className={styles.row}>
                <strong>{mv.movementTypeDetailed ?? mv.movementType}</strong>
                <div className={styles.meta}>
                  <span>Item: {mv.stockItemId}</span>
                  <span>Qtd: {Number(mv.quantity).toFixed(3)}</span>
                  <span>Anterior: {mv.previousStock ?? '-'}</span>
                  <span>Novo: {mv.newStock ?? '-'}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </main>
  );
}
