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
  createStockBatch,
  estimateStockConversion,
  listStockItems,
  listStockBatches,
  listStockMovements,
  listStockBreakageAlerts,
  stockManualEntry,
  stockManualExit,
  stockRegisterLoss,
  applyInventoryCounts,
  type StockItem,
  type StockBreakageAlert,
  type StockBatch,
  type StockMovement,
} from '@/features/stock/stock.api';
import styles from './page.module.css';

export default function AdminStockPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [alerts, setAlerts] = useState<StockBreakageAlert[]>([]);
  const [batches, setBatches] = useState<StockBatch[]>([]);
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
  const [lossQty, setLossQty] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [batchExpiration, setBatchExpiration] = useState('');
  const [batchQty, setBatchQty] = useState('');
  const [convQty, setConvQty] = useState('1');
  const [convFrom, setConvFrom] = useState('un');
  const [convTo, setConvTo] = useState('un');
  const [convResult, setConvResult] = useState<string | null>(null);

  const selected = useMemo(() => items.find((it) => it.id === selectedItemId) ?? null, [items, selectedItemId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [stockItems, stockMovements, stockAlerts] = await Promise.all([
        listStockItems(),
        listStockMovements(),
        listStockBreakageAlerts(),
      ]);
      setItems(stockItems);
      setMovements(stockMovements);
      setAlerts(stockAlerts);
      if (!selectedItemId && stockItems[0]?.id) setSelectedItemId(stockItems[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar estoque.');
    } finally {
      setLoading(false);
    }
  }

  async function loadBatches(itemId: string) {
    if (!itemId) {
      setBatches([]);
      return;
    }
    try {
      const list = await listStockBatches(itemId);
      setBatches(list);
    } catch {
      setBatches([]);
    }
  }

  async function submitLoss() {
    if (!selectedItemId) {
      setError('Selecione um item.');
      return;
    }
    const qty = Number(lossQty || '0');
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Quantidade de perda invalida.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await stockRegisterLoss({
        stockItemId: selectedItemId,
        quantity: qty,
        unitCost: Number(moveCost || '0'),
        reasonCode: 'breakage_manual',
      });
      setItems((prev) => prev.map((it) => (it.id === result.item.id ? { ...it, ...result.item } : it)));
      setMovements((prev) => [result.movement, ...prev]);
      setLossQty('');
      setNotice('Perda/quebra registrada.');
      const refreshedAlerts = await listStockBreakageAlerts();
      setAlerts(refreshedAlerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar perda.');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedItemId) return;
    void loadBatches(selectedItemId);
  }, [selectedItemId]);

  async function onCreateItem(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await createStockItem({
        name: itemName,
        stockUnit: itemUnit,
        purchaseUnit: itemUnit,
        productionUnit: itemUnit,
        conversionFactor: 1,
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

  async function submitBatch() {
    if (!selectedItemId) return setError('Selecione um item.');
    const quantity = Number(batchQty || '0');
    if (!Number.isFinite(quantity) || quantity <= 0) return setError('Quantidade de lote invalida.');
    setSaving(true);
    setError(null);
    try {
      await createStockBatch(selectedItemId, {
        batchNumber: batchNumber || undefined,
        expirationDate: batchExpiration || undefined,
        initialQuantity: quantity,
        unitCost: Number(moveCost || '0') || undefined,
      });
      setBatchNumber('');
      setBatchExpiration('');
      setBatchQty('');
      await load();
      await loadBatches(selectedItemId);
      setNotice('Lote registrado com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar lote.');
    } finally {
      setSaving(false);
    }
  }

  async function runConversionEstimate() {
    if (!selectedItemId) return setError('Selecione um item.');
    setSaving(true);
    setError(null);
    try {
      const result = await estimateStockConversion({
        stockItemId: selectedItemId,
        quantity: Number(convQty || '0'),
        fromUnit: convFrom,
        toUnit: convTo,
      });
      setConvResult(`${result.inputQuantity} ${result.fromUnit} = ${result.convertedQuantity} ${result.toUnit}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao estimar conversao.');
      setConvResult(null);
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
      <Card className={styles.card}>
        <h2>Alertas de ruptura</h2>
        {alerts.length === 0 ? <span>Sem alertas no momento.</span> : null}
        {alerts.map((alert) => (
          <div key={alert.stockItemId} className={styles.row}>
            <strong>{alert.name}</strong>
            <div className={styles.meta}>
              <span>Tipo: {alert.type}</span>
              <span>Severidade: {alert.severity}</span>
              <span>Atual: {alert.currentQuantity}</span>
              <span>Min: {alert.minimumQuantity}</span>
              <span>Reorder: {alert.reorderPoint}</span>
            </div>
          </div>
        ))}
      </Card>

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
          <div className={styles.formRow}>
            <Input placeholder="Quantidade perda/quebra" value={lossQty} onChange={(e) => setLossQty(e.target.value)} />
            <Button variant="danger" disabled={saving || !selectedItemId} onClick={() => void submitLoss()}>
              Registrar perda/quebra
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

        <Card className={styles.card}>
          <h2>Lotes e validade</h2>
          <div className={styles.formRow}>
            <Input placeholder="Numero do lote" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
            <Input placeholder="Validade (YYYY-MM-DD)" value={batchExpiration} onChange={(e) => setBatchExpiration(e.target.value)} />
            <Input placeholder="Quantidade lote" value={batchQty} onChange={(e) => setBatchQty(e.target.value)} />
            <Button disabled={saving || !selectedItemId} onClick={() => void submitBatch()}>
              Registrar lote
            </Button>
          </div>
          <div className={styles.itemsList}>
            {batches.length === 0 ? <EmptyState title="Sem lotes" description="Cadastre o primeiro lote do item." /> : null}
            {batches.map((batch) => (
              <div key={batch.id} className={styles.row}>
                <strong>Lote {batch.batchNumber ?? '-'}</strong>
                <div className={styles.meta}>
                  <span>Validade: {batch.expirationDate ? new Date(batch.expirationDate).toLocaleDateString('pt-BR') : '-'}</span>
                  <span>Inicial: {Number(batch.initialQuantity).toFixed(3)}</span>
                  <span>Saldo: {Number(batch.quantityRemaining).toFixed(3)}</span>
                  <span>Status: {batch.status}</span>
                </div>
              </div>
            ))}
          </div>

          <h3>Conversao de unidade</h3>
          <div className={styles.formRow}>
            <Input placeholder="Quantidade" value={convQty} onChange={(e) => setConvQty(e.target.value)} />
            <Input placeholder="De unidade" value={convFrom} onChange={(e) => setConvFrom(e.target.value)} />
            <Input placeholder="Para unidade" value={convTo} onChange={(e) => setConvTo(e.target.value)} />
            <Button disabled={saving || !selectedItemId} onClick={() => void runConversionEstimate()}>
              Estimar
            </Button>
          </div>
          {convResult ? <Badge tone="success">{convResult}</Badge> : null}
        </Card>
      </section>
    </main>
  );
}
