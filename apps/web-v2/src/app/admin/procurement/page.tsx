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
  createPurchaseOrder,
  createSupplier,
  listAccountsPayable,
  listPurchaseOrders,
  listSuppliers,
  receivePurchaseOrder,
  type PurchaseOrder,
  type Supplier,
} from '@/features/procurement/procurement.api';
import styles from './page.module.css';

export default function AdminProcurementPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [payables, setPayables] = useState<Array<{ id: string; description: string; amount: number; status: string; dueDate: string; supplier?: { id: string; name: string } }>>([]);

  const [supplierName, setSupplierName] = useState('');
  const [supplierDocument, setSupplierDocument] = useState('');

  const [poSupplierId, setPoSupplierId] = useState('');
  const [poStockItemId, setPoStockItemId] = useState('');
  const [poQty, setPoQty] = useState('');
  const [poUnitCost, setPoUnitCost] = useState('');

  const [receiveOrderId, setReceiveOrderId] = useState('');
  const [receiveInvoice, setReceiveInvoice] = useState('');

  const selectedOrder = useMemo(() => orders.find((row) => row.id === receiveOrderId) ?? null, [orders, receiveOrderId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [sup, ord, ap] = await Promise.all([listSuppliers(), listPurchaseOrders(), listAccountsPayable()]);
      setSuppliers(sup);
      setOrders(ord);
      setPayables(ap);
      if (!poSupplierId && sup[0]?.id) setPoSupplierId(sup[0].id);
      if (!receiveOrderId && ord[0]?.id) setReceiveOrderId(ord[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar compras.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreateSupplier(event: FormEvent) {
    event.preventDefault();
    if (!supplierName.trim()) return setError('Nome do fornecedor obrigatorio.');
    setSaving(true);
    setError(null);
    try {
      const created = await createSupplier({ name: supplierName.trim(), document: supplierDocument || undefined });
      setSuppliers((prev) => [created, ...prev]);
      setSupplierName('');
      setSupplierDocument('');
      setNotice('Fornecedor criado.');
      if (!poSupplierId) setPoSupplierId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar fornecedor.');
    } finally {
      setSaving(false);
    }
  }

  async function onCreatePurchaseOrder(event: FormEvent) {
    event.preventDefault();
    if (!poSupplierId || !poStockItemId) return setError('Fornecedor e item de estoque obrigatorios.');
    const quantity = Number(poQty || '0');
    const unitCost = Number(poUnitCost || '0');
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) return setError('Quantidade/custo invalidos.');
    setSaving(true);
    setError(null);
    try {
      const created = await createPurchaseOrder({
        supplierId: poSupplierId,
        items: [{ stockItemId: poStockItemId, quantity, unitCost }],
      });
      setOrders((prev) => [created, ...prev]);
      setPoQty('');
      setPoUnitCost('');
      setNotice('Pedido de compra criado.');
      if (!receiveOrderId) setReceiveOrderId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar pedido.');
    } finally {
      setSaving(false);
    }
  }

  async function onReceiveOrder() {
    if (!selectedOrder || !selectedOrder.items?.length) return setError('Selecione um pedido com itens.');
    setSaving(true);
    setError(null);
    try {
      await receivePurchaseOrder(selectedOrder.id, {
        invoiceNumber: receiveInvoice || undefined,
        items: selectedOrder.items.map((row) => ({
          stockItemId: row.stockItemId,
          receivedQuantity: Number(row.quantity),
          orderedQuantity: Number(row.quantity),
          unitCost: Number(row.unitCost),
        })),
      });
      setReceiveInvoice('');
      await load();
      setNotice('Recebimento processado e conta a pagar gerada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao receber pedido.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className={styles.page}><LoadingState label="Carregando compras e fornecedores..." /></main>;

  return (
    <main className={styles.page}>
      <PageHeader title="Compras e Fornecedores" subtitle="Fornecedores, pedidos, recebimento, cotacao e contas a pagar" right={<Button onClick={() => void load()}>Atualizar</Button>} />

      {error ? <Card className={styles.card}><Badge tone="danger">Erro</Badge><span>{error}</span></Card> : null}
      {notice ? <Card className={styles.card}><Badge tone="success">OK</Badge><span>{notice}</span></Card> : null}

      <section className={styles.grid}>
        <Card className={styles.card}>
          <h2>Fornecedores</h2>
          <form className={styles.formRow} onSubmit={(e) => void onCreateSupplier(e)}>
            <Input placeholder="Nome fornecedor" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            <Input placeholder="Documento" value={supplierDocument} onChange={(e) => setSupplierDocument(e.target.value)} />
            <Button type="submit" disabled={saving}>Cadastrar fornecedor</Button>
          </form>
          <div className={styles.list}>
            {suppliers.length === 0 ? <EmptyState title="Sem fornecedores" /> : null}
            {suppliers.map((row) => (
              <div key={row.id} className={styles.row}>
                <strong>{row.name}</strong>
                <div className={styles.meta}>
                  <span>Documento: {row.document ?? '-'}</span>
                  <span>Status: {row.active ? 'ATIVO' : 'INATIVO'}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className={styles.card}>
          <h2>Pedido de compra</h2>
          <form className={styles.formRow} onSubmit={(e) => void onCreatePurchaseOrder(e)}>
            <select value={poSupplierId} onChange={(e) => setPoSupplierId(e.target.value)}>
              {suppliers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
            <Input placeholder="Stock item ID" value={poStockItemId} onChange={(e) => setPoStockItemId(e.target.value)} />
            <Input placeholder="Quantidade" value={poQty} onChange={(e) => setPoQty(e.target.value)} />
            <Input placeholder="Custo unitario" value={poUnitCost} onChange={(e) => setPoUnitCost(e.target.value)} />
            <Button type="submit" disabled={saving}>Criar pedido</Button>
          </form>
          <div className={styles.list}>
            {orders.length === 0 ? <EmptyState title="Sem pedidos" /> : null}
            {orders.map((row) => (
              <button key={row.id} type="button" className={styles.row} onClick={() => setReceiveOrderId(row.id)}>
                <strong>Pedido {row.id.slice(0, 8)}</strong>
                <div className={styles.meta}>
                  <span>Fornecedor: {row.supplier?.name ?? row.supplierId}</span>
                  <span>Status: {row.status}</span>
                  <span>Total: R$ {Number(row.totalAmount).toFixed(2)}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className={styles.card}>
          <h2>Recebimento e conferencia</h2>
          <div className={styles.formRow}>
            <Input placeholder="Pedido selecionado" value={selectedOrder?.id ?? ''} readOnly />
            <Input placeholder="Numero da NF" value={receiveInvoice} onChange={(e) => setReceiveInvoice(e.target.value)} />
            <Button disabled={saving || !selectedOrder} onClick={() => void onReceiveOrder()}>Receber mercadoria</Button>
          </div>
          {selectedOrder?.items?.length ? (
            <div className={styles.list}>
              {selectedOrder.items.map((row) => (
                <div key={row.id} className={styles.row}>
                  <strong>Item {row.stockItemId}</strong>
                  <div className={styles.meta}>
                    <span>Qtd: {Number(row.quantity).toFixed(3)}</span>
                    <span>Custo: R$ {Number(row.unitCost).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Selecione um pedido" description="Escolha um pedido para receber e conferir nota/entrada." />
          )}
        </Card>

        <Card className={styles.card}>
          <h2>Contas a pagar (por compra)</h2>
          <div className={styles.list}>
            {payables.length === 0 ? <EmptyState title="Sem contas a pagar" /> : null}
            {payables.map((row) => (
              <div key={row.id} className={styles.row}>
                <strong>{row.description}</strong>
                <div className={styles.meta}>
                  <span>Fornecedor: {row.supplier?.name ?? '-'}</span>
                  <span>Valor: R$ {Number(row.amount).toFixed(2)}</span>
                  <span>Status: {row.status}</span>
                  <span>Vencimento: {row.dueDate ? new Date(row.dueDate).toLocaleDateString('pt-BR') : '-'}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </main>
  );
}

