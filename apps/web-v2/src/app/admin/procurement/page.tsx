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
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  createSupplier,
  confirmPurchaseFiscalDocumentStockEntry,
  ignorePurchaseFiscalDocumentItem,
  importPurchaseFiscalDocument,
  listAccountsPayable,
  listPurchaseDocuments,
  listPurchaseOrders,
  listSuppliers,
  mapPurchaseFiscalDocumentItem,
  receivePurchaseOrder,
  type PurchaseDocument,
  type PurchaseOrder,
  type Supplier,
  updateSupplier,
} from '@/features/procurement/procurement.api';
import { listStockItems, type StockItem } from '@/features/stock/stock.api';
import styles from './page.module.css';

export default function AdminProcurementPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [payables, setPayables] = useState<Array<{ id: string; description: string; amount: number; status: string; dueDate: string; supplier?: { id: string; name: string } }>>([]);
  const [purchaseDocuments, setPurchaseDocuments] = useState<PurchaseDocument[]>([]);

  const [supplierName, setSupplierName] = useState('');
  const [supplierDocument, setSupplierDocument] = useState('');

  const [poSupplierId, setPoSupplierId] = useState('');
  const [poStockItemId, setPoStockItemId] = useState('');
  const [poQty, setPoQty] = useState('');
  const [poUnitCost, setPoUnitCost] = useState('');

  const [receiveOrderId, setReceiveOrderId] = useState('');
  const [receiveInvoice, setReceiveInvoice] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [fiscalSupplierId, setFiscalSupplierId] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [mappingStockItemId, setMappingStockItemId] = useState('');
  const [mappingConversionFactor, setMappingConversionFactor] = useState('1');

  const selectedOrder = useMemo(() => orders.find((row) => row.id === receiveOrderId) ?? null, [orders, receiveOrderId]);
  const selectedDocument = useMemo(() => purchaseDocuments.find((row) => row.id === selectedDocumentId) ?? purchaseDocuments[0] ?? null, [purchaseDocuments, selectedDocumentId]);
  const fiscalKpis = useMemo(() => {
    const pending = purchaseDocuments.filter((doc) => ['PENDING_REVIEW', 'PARTIALLY_MAPPED', 'READY_TO_CONFIRM'].includes(doc.status)).length;
    const confirmed = purchaseDocuments.filter((doc) => doc.status === 'CONFIRMED').length;
    const total = purchaseDocuments.reduce((acc, doc) => acc + Number(doc.totalAmount ?? 0), 0);
    return { pending, confirmed, total };
  }, [purchaseDocuments]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [sup, ord, stk, ap, docs] = await Promise.all([listSuppliers(), listPurchaseOrders(), listStockItems(), listAccountsPayable(), listPurchaseDocuments()]);
      setSuppliers(sup);
      setOrders(ord);
      setStockItems(stk);
      setPayables(ap);
      setPurchaseDocuments(docs);
      if (!poSupplierId && sup[0]?.id) setPoSupplierId(sup[0].id);
      if (!fiscalSupplierId && sup[0]?.id) setFiscalSupplierId(sup[0].id);
      if (!poStockItemId && stk[0]?.id) setPoStockItemId(stk[0].id);
      if (!mappingStockItemId && stk[0]?.id) setMappingStockItemId(stk[0].id);
      if (!receiveOrderId && ord[0]?.id) setReceiveOrderId(ord[0].id);
      if (!selectedDocumentId && docs[0]?.id) setSelectedDocumentId(docs[0].id);
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

  async function onToggleSupplier(supplier: Supplier) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSupplier(supplier.id, { active: !supplier.active });
      setSuppliers((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setNotice(updated.active ? 'Fornecedor reativado.' : 'Fornecedor inativado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao alterar fornecedor.');
    } finally {
      setSaving(false);
    }
  }

  async function onApproveOrder(order: PurchaseOrder) {
    setSaving(true);
    setError(null);
    try {
      await approvePurchaseOrder(order.id);
      await load();
      setNotice('Pedido de compra aprovado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aprovar pedido.');
    } finally {
      setSaving(false);
    }
  }

  async function onCancelOrder(order: PurchaseOrder) {
    setSaving(true);
    setError(null);
    try {
      await cancelPurchaseOrder(order.id);
      await load();
      setNotice('Pedido de compra cancelado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cancelar pedido.');
    } finally {
      setSaving(false);
    }
  }

  async function onReceiveOrder() {
    if (!selectedOrder || !selectedOrder.items?.length) return setError('Selecione um pedido com itens.');
    if (['CANCELED', 'RECEIVED', 'PARTIALLY_RECEIVED'].includes(selectedOrder.status)) return setError('Pedido nao esta disponivel para recebimento.');
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

  async function onImportFiscalDocument(event: FormEvent) {
    event.preventDefault();
    const normalized = accessKey.replace(/\D/g, '');
    if (!/^\d{44}$/.test(normalized)) return setError('Chave de acesso deve conter 44 digitos numericos.');
    setSaving(true);
    setError(null);
    try {
      const created = await importPurchaseFiscalDocument({
        accessKey: normalized,
        supplierId: fiscalSupplierId || undefined,
        documentType: normalized.slice(20, 22) === '55' ? 'NFE' : 'NFCE',
      });
      setPurchaseDocuments((prev) => [created, ...prev]);
      setSelectedDocumentId(created.id);
      setAccessKey('');
      setNotice('Cupom fiscal importado para revisao. Revise e mapeie os itens antes de confirmar estoque.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao importar cupom fiscal.');
    } finally {
      setSaving(false);
    }
  }

  async function onMapFiscalItem(itemId: string) {
    if (!selectedDocument) return setError('Selecione um documento fiscal.');
    if (!mappingStockItemId) return setError('Selecione um insumo para mapeamento.');
    const conversionFactor = Number(mappingConversionFactor || '1');
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) return setError('Fator de conversao invalido.');
    setSaving(true);
    setError(null);
    try {
      await mapPurchaseFiscalDocumentItem(selectedDocument.id, itemId, { stockItemId: mappingStockItemId, conversionFactor });
      await load();
      setNotice('Item fiscal mapeado para insumo.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao mapear item fiscal.');
    } finally {
      setSaving(false);
    }
  }

  async function onIgnoreFiscalItem(itemId: string) {
    if (!selectedDocument) return setError('Selecione um documento fiscal.');
    setSaving(true);
    setError(null);
    try {
      await ignorePurchaseFiscalDocumentItem(selectedDocument.id, itemId);
      await load();
      setNotice('Item fiscal ignorado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ignorar item fiscal.');
    } finally {
      setSaving(false);
    }
  }

  async function onConfirmFiscalDocument() {
    if (!selectedDocument) return setError('Selecione um documento fiscal.');
    setSaving(true);
    setError(null);
    try {
      const result = await confirmPurchaseFiscalDocumentStockEntry(selectedDocument.id);
      await load();
      setNotice(result.confirmed ? `Entrada confirmada com ${result.movementsCreated ?? 0} movimentos.` : 'Documento ja estava confirmado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao confirmar entrada fiscal.');
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
      <section className={styles.kpiGrid}>
        <Card className={styles.kpiCard}>
          <span>Documentos em revisao</span>
          <strong>{fiscalKpis.pending}</strong>
          <small>Itens aguardando mapeamento/conferencia</small>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Documentos confirmados</span>
          <strong>{fiscalKpis.confirmed}</strong>
          <small>Ja geraram entrada no estoque</small>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Total fiscal importado</span>
          <strong>R$ {fiscalKpis.total.toFixed(2)}</strong>
          <small>Somente documentos de compra importados</small>
        </Card>
      </section>

      <section className={styles.grid}>
        <Card className={styles.card}>
          <h2>Importar cupom fiscal</h2>
          <p className={styles.help}>Informe a chave de acesso de 44 digitos. O provider local gera uma pre-importacao para revisao, sem movimentar estoque automaticamente.</p>
          <form className={styles.formRow} onSubmit={(e) => void onImportFiscalDocument(e)}>
            <Input placeholder="Chave de acesso NFC-e/NF-e" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} />
            <select value={fiscalSupplierId} onChange={(e) => setFiscalSupplierId(e.target.value)}>
              <option value="">Fornecedor opcional</option>
              {suppliers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
            <Button type="submit" disabled={saving}>Importar para revisao</Button>
          </form>
          <div className={styles.list}>
            {purchaseDocuments.length === 0 ? <EmptyState title="Sem cupons importados" description="Importe uma chave fiscal para revisar os itens antes da entrada." /> : null}
            {purchaseDocuments.map((doc) => (
              <button key={doc.id} type="button" className={`${styles.row} ${selectedDocument?.id === doc.id ? styles.selectedRow : ''}`.trim()} onClick={() => setSelectedDocumentId(doc.id)}>
                <strong>{doc.issuerName ?? doc.issuerCnpj ?? doc.accessKey}</strong>
                <div className={styles.meta}>
                  <span>Status: {doc.status}</span>
                  <span>Tipo: {doc.documentType}</span>
                  <span>Total: R$ {Number(doc.totalAmount ?? 0).toFixed(2)}</span>
                  <span>Itens: {doc.items?.length ?? 0}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className={styles.card}>
          <h2>Revisao fiscal e mapeamento</h2>
          {selectedDocument ? (
            <>
              <div className={styles.meta}>
                <Badge tone={selectedDocument.status === 'CONFIRMED' ? 'success' : selectedDocument.status === 'READY_TO_CONFIRM' ? 'warning' : 'default'}>{selectedDocument.status}</Badge>
                <span>Chave: {selectedDocument.accessKey}</span>
                <span>Fornecedor fiscal: {selectedDocument.issuerName ?? '-'}</span>
              </div>
              <div className={styles.formRow}>
                <select value={mappingStockItemId} onChange={(e) => setMappingStockItemId(e.target.value)}>
                  {stockItems.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
                <Input placeholder="Fator conversao" value={mappingConversionFactor} onChange={(e) => setMappingConversionFactor(e.target.value)} />
                <Button disabled={saving || selectedDocument.status !== 'READY_TO_CONFIRM'} onClick={() => void onConfirmFiscalDocument()}>
                  Confirmar entrada no estoque
                </Button>
              </div>
              <div className={styles.list}>
                {selectedDocument.items.map((item) => (
                  <div key={item.id} className={styles.row}>
                    <strong>{item.description}</strong>
                    <div className={styles.meta}>
                      <span>Status: {item.status}</span>
                      <span>Qtd fiscal: {Number(item.quantity).toFixed(3)} {item.unit ?? ''}</span>
                      <span>Unitario: R$ {Number(item.unitPrice ?? 0).toFixed(2)}</span>
                      <span>Total: R$ {Number(item.totalAmount ?? 0).toFixed(2)}</span>
                      {item.mappedStockItemId ? <span>Insumo: {stockItems.find((stock) => stock.id === item.mappedStockItemId)?.name ?? item.mappedStockItemId}</span> : null}
                    </div>
                    <div className={styles.actions}>
                      <Button disabled={saving || selectedDocument.status === 'CONFIRMED'} onClick={() => void onMapFiscalItem(item.id)}>Mapear para insumo</Button>
                      <Button disabled={saving || selectedDocument.status === 'CONFIRMED'} variant="danger" onClick={() => void onIgnoreFiscalItem(item.id)}>Ignorar</Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState title="Selecione uma importacao" description="Importe ou selecione um cupom fiscal para revisar os itens." />
          )}
        </Card>

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
                <div className={styles.actions}>
                  <Button disabled={saving} variant={row.active ? 'danger' : 'default'} onClick={() => void onToggleSupplier(row)}>
                    {row.active ? 'Inativar' : 'Reativar'}
                  </Button>
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
            <select value={poStockItemId} onChange={(e) => setPoStockItemId(e.target.value)}>
              {stockItems.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
            <Input placeholder="Quantidade" value={poQty} onChange={(e) => setPoQty(e.target.value)} />
            <Input placeholder="Custo unitario" value={poUnitCost} onChange={(e) => setPoUnitCost(e.target.value)} />
            <Button type="submit" disabled={saving}>Criar pedido</Button>
          </form>
          <div className={styles.list}>
            {orders.length === 0 ? <EmptyState title="Sem pedidos" /> : null}
            {orders.map((row) => (
              <div key={row.id} className={`${styles.row} ${receiveOrderId === row.id ? styles.selectedRow : ''}`.trim()}>
                <button type="button" className={styles.rowButton} onClick={() => setReceiveOrderId(row.id)}>
                  <strong>Pedido {row.id.slice(0, 8)}</strong>
                </button>
                <div className={styles.meta}>
                  <span>Fornecedor: {row.supplier?.name ?? row.supplierId}</span>
                  <span>Status: {row.status}</span>
                  <span>Total: R$ {Number(row.totalAmount).toFixed(2)}</span>
                </div>
                <div className={styles.actions}>
                  <Button disabled={saving || row.status !== 'DRAFT'} onClick={() => void onApproveOrder(row)}>Aprovar</Button>
                  <Button disabled={saving || ['CANCELED', 'RECEIVED', 'PARTIALLY_RECEIVED'].includes(row.status)} variant="danger" onClick={() => void onCancelOrder(row)}>Cancelar</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className={styles.card}>
          <h2>Recebimento e conferencia</h2>
          <div className={styles.formRow}>
            <Input placeholder="Pedido selecionado" value={selectedOrder?.id ?? ''} readOnly />
            <Input placeholder="Numero da NF" value={receiveInvoice} onChange={(e) => setReceiveInvoice(e.target.value)} />
            <Button disabled={saving || !selectedOrder || ['CANCELED', 'RECEIVED', 'PARTIALLY_RECEIVED'].includes(selectedOrder.status)} onClick={() => void onReceiveOrder()}>Receber mercadoria</Button>
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

