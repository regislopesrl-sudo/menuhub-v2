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
  getFiscalLookupStatus,
  getProcurementDashboard,
  ignorePurchaseFiscalDocumentItem,
  importPurchaseFiscalDocument,
  listAccountsPayable,
  listPurchaseHistorySummary,
  listPurchaseDocuments,
  listPurchaseOrders,
  listSuppliers,
  mapPurchaseFiscalDocumentItem,
  type ProcurementDashboard,
  type FiscalLookupStatus,
  type PurchaseHistorySummary,
  receivePurchaseOrder,
  type PurchaseDocument,
  type PurchaseOrder,
  type Supplier,
  updateSupplierStatus,
} from '@/features/procurement/procurement.api';
import { listStockItems, type StockItem } from '@/features/stock/stock.api';
import styles from './page.module.css';

function normalizeSearch(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSearchTokens(value: unknown) {
  const ignored = new Set(['kg', 'un', 'pct', 'cx', 'com', 'sem', 'de', 'da', 'do', 'dos', 'das', 'para', 'tipo']);
  return normalizeSearch(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !ignored.has(token));
}

function suggestStockItemForFiscalLine(description: string, stockItems: StockItem[]) {
  const tokens = getSearchTokens(description);
  if (tokens.length === 0) return null;
  const candidates = stockItems
    .map((stockItem) => {
      const haystack = normalizeSearch(`${stockItem.name} ${stockItem.code ?? ''} ${stockItem.category?.name ?? ''}`);
      const score = tokens.reduce((acc, token) => acc + (haystack.includes(token) ? 1 : 0), 0);
      const confidence = score / Math.max(tokens.length, 1);
      return { stockItem, score, confidence };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.confidence - left.confidence || right.score - left.score || left.stockItem.name.localeCompare(right.stockItem.name))[0];

  return candidates ?? null;
}

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
  const [dashboard, setDashboard] = useState<ProcurementDashboard | null>(null);
  const [fiscalLookupStatus, setFiscalLookupStatus] = useState<FiscalLookupStatus | null>(null);
  const [historySummary, setHistorySummary] = useState<PurchaseHistorySummary[]>([]);

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
  const rawMaterialItems = useMemo(() => stockItems.filter((row) => row.stockType === 'RAW_MATERIAL' && row.isActive !== false), [stockItems]);
  const normalizedAccessKey = useMemo(() => accessKey.replace(/\D/g, ''), [accessKey]);
  const accessKeyPreview = useMemo(() => {
    if (normalizedAccessKey.length < 44) return null;
    const model = normalizedAccessKey.slice(20, 22);
    return {
      uf: normalizedAccessKey.slice(0, 2),
      period: `${normalizedAccessKey.slice(4, 6)}/${2000 + Number(normalizedAccessKey.slice(2, 4))}`,
      issuerCnpj: normalizedAccessKey.slice(6, 20),
      model: model === '55' ? 'NF-e' : model === '65' ? 'NFC-e' : model,
      series: normalizedAccessKey.slice(22, 25),
      number: normalizedAccessKey.slice(25, 34),
    };
  }, [normalizedAccessKey]);
  const fiscalKpis = useMemo(() => {
    const pending = purchaseDocuments.filter((doc) => ['PENDING_REVIEW', 'PARTIALLY_MAPPED', 'READY_TO_CONFIRM'].includes(doc.status)).length;
    const confirmed = purchaseDocuments.filter((doc) => doc.status === 'CONFIRMED').length;
    const total = purchaseDocuments.reduce((acc, doc) => acc + Number(doc.totalAmount ?? 0), 0);
    return { pending, confirmed, total };
  }, [purchaseDocuments]);
  const selectedDocumentStats = useMemo(() => {
    const items = selectedDocument?.items ?? [];
    return {
      total: items.length,
      mapped: items.filter((item) => item.status === 'MAPPED' || item.status === 'CONFIRMED').length,
      ignored: items.filter((item) => item.status === 'IGNORED').length,
      unmapped: items.filter((item) => item.status === 'UNMAPPED').length,
    };
  }, [selectedDocument]);
  const fiscalItemSuggestions = useMemo(() => {
    const map = new Map<string, { stockItem: StockItem; confidence: number; score: number }>();
    (selectedDocument?.items ?? []).forEach((item) => {
      if (item.mappedStockItemId || item.status === 'IGNORED' || item.status === 'CONFIRMED') return;
      const suggestion = suggestStockItemForFiscalLine(item.description, rawMaterialItems);
      if (suggestion) map.set(item.id, suggestion);
    });
    return map;
  }, [rawMaterialItems, selectedDocument]);
  const strongFiscalSuggestions = useMemo(
    () => Array.from(fiscalItemSuggestions.entries()).filter(([, suggestion]) => suggestion.confidence >= 0.5),
    [fiscalItemSuggestions],
  );
  const isLocalFiscalProvider = !fiscalLookupStatus?.realLookupEnabled || selectedDocument?.providerName === 'local-mock';

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [dash, fiscalStatus, sup, ord, stk, ap, docs, history] = await Promise.all([
        getProcurementDashboard(),
        getFiscalLookupStatus(),
        listSuppliers(),
        listPurchaseOrders(),
        listStockItems(),
        listAccountsPayable(),
        listPurchaseDocuments(),
        listPurchaseHistorySummary(),
      ]);
      const insumos = stk.filter((row) => row.stockType === 'RAW_MATERIAL' && row.isActive !== false);
      setDashboard(dash);
      setFiscalLookupStatus(fiscalStatus);
      setSuppliers(sup);
      setOrders(ord);
      setStockItems(stk);
      setPayables(ap);
      setPurchaseDocuments(docs);
      setHistorySummary(history);
      if (!poSupplierId && sup[0]?.id) setPoSupplierId(sup[0].id);
      if (!fiscalSupplierId && sup[0]?.id) setFiscalSupplierId(sup[0].id);
      if (!poStockItemId && insumos[0]?.id) setPoStockItemId(insumos[0].id);
      if (!mappingStockItemId && insumos[0]?.id) setMappingStockItemId(insumos[0].id);
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
    if (!rawMaterialItems.some((row) => row.id === poStockItemId)) return setError('Pedido de compra deve usar um insumo ativo.');
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
      const updated = await updateSupplierStatus(supplier.id, { active: !supplier.active });
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
    const normalized = normalizedAccessKey;
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
    if (!rawMaterialItems.some((row) => row.id === mappingStockItemId)) return setError('Mapeamento fiscal deve usar um insumo ativo.');
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

  async function onMapFiscalItemWithSuggestion(itemId: string) {
    if (!selectedDocument) return setError('Selecione um documento fiscal.');
    const suggestion = fiscalItemSuggestions.get(itemId);
    if (!suggestion) return setError('Nenhuma sugestao disponivel para este item.');
    setSaving(true);
    setError(null);
    try {
      await mapPurchaseFiscalDocumentItem(selectedDocument.id, itemId, {
        stockItemId: suggestion.stockItem.id,
        conversionFactor: 1,
      });
      await load();
      setNotice(`Item fiscal mapeado para ${suggestion.stockItem.name}. Revise o fator de conversao antes de confirmar estoque.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aplicar sugestao de mapeamento.');
    } finally {
      setSaving(false);
    }
  }

  async function onMapStrongFiscalSuggestions() {
    if (!selectedDocument) return setError('Selecione um documento fiscal.');
    if (strongFiscalSuggestions.length === 0) return setError('Nao ha sugestoes com confianca suficiente para mapear automaticamente.');
    setSaving(true);
    setError(null);
    try {
      await Promise.all(strongFiscalSuggestions.map(([itemId, suggestion]) => (
        mapPurchaseFiscalDocumentItem(selectedDocument.id, itemId, {
          stockItemId: suggestion.stockItem.id,
          conversionFactor: 1,
        })
      )));
      await load();
      setNotice(`${strongFiscalSuggestions.length} item(ns) mapeado(s) por sugestao. Revise fatores de conversao antes de confirmar estoque.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao mapear sugestoes automaticamente.');
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
      {rawMaterialItems.length === 0 ? (
        <Card className={styles.card}>
          <Badge tone="warning">Estoque</Badge>
          <span>Cadastre insumos ativos em Estoque para criar pedidos de compra e mapear itens de cupom fiscal.</span>
        </Card>
      ) : null}
      <section className={styles.kpiGrid}>
        <Card className={styles.kpiCard}>
          <span>Fornecedores ativos</span>
          <strong>{dashboard?.suppliers.active ?? suppliers.filter((row) => row.active).length}</strong>
          <small>{dashboard?.suppliers.inactive ?? suppliers.filter((row) => !row.active).length} inativos cadastrados</small>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Pedidos em aberto</span>
          <strong>{dashboard?.purchaseOrders.open ?? orders.filter((row) => ['DRAFT', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(row.status)).length}</strong>
          <small>Compra, aprovacao e recebimento</small>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Compras 30 dias</span>
          <strong>R$ {(dashboard?.purchaseOrders.totalLast30Days ?? orders.reduce((acc, row) => acc + Number(row.totalAmount ?? 0), 0)).toFixed(2)}</strong>
          <small>Pedidos nao cancelados recentes</small>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Fiscal em revisao</span>
          <strong>{dashboard?.fiscalDocuments.pendingReview ?? fiscalKpis.pending}</strong>
          <small>{dashboard?.fiscalDocuments.readyToConfirm ?? 0} prontos para confirmar</small>
        </Card>
        <Card className={styles.kpiCard}>
          <span>A pagar compras</span>
          <strong>R$ {(dashboard?.accountsPayable.pendingAmount ?? payables.reduce((acc, row) => acc + Number(row.amount ?? 0), 0)).toFixed(2)}</strong>
          <small>{dashboard?.accountsPayable.pending ?? payables.length} pendentes</small>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Vencidas</span>
          <strong>{dashboard?.accountsPayable.overdue ?? 0}</strong>
          <small>Contas de compras em atraso</small>
        </Card>
      </section>

      <section className={styles.fiscalGrid}>
        <Card className={`${styles.card} ${styles.importCard}`}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Entrada por nota</span>
              <h2>Importar cupom fiscal</h2>
            </div>
            <Badge tone={fiscalLookupStatus?.realLookupEnabled ? 'success' : 'warning'}>
              {fiscalLookupStatus?.realLookupEnabled ? 'Consulta real' : 'Provider local'}
            </Badge>
          </div>
          {fiscalLookupStatus?.realLookupEnabled ? (
            <div className={styles.realProviderAlert}>
              <strong>Consulta real habilitada.</strong>
              <span>O sistema vai consultar o provider fiscal configurado e importar os itens retornados para revisao antes de movimentar estoque.</span>
            </div>
          ) : (
            <div className={styles.providerAlert}>
              <strong>Consulta real ainda nao configurada.</strong>
              <span>O DEV usa `local-mock`, entao a chave e validada e o sistema cria uma pre-importacao de teste. Para trazer dados reais de supermercado e itens do cupom, configure um provedor fiscal com certificado digital/API.</span>
            </div>
          )}
          <form className={styles.importForm} onSubmit={(e) => void onImportFiscalDocument(e)}>
            <label className={styles.field}>
              <span>Chave de acesso</span>
              <Input placeholder="44 digitos da NFC-e/NF-e" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Fornecedor vinculado</span>
              <select value={fiscalSupplierId} onChange={(e) => setFiscalSupplierId(e.target.value)}>
                <option value="">Fornecedor opcional</option>
                {suppliers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            <Button type="submit" disabled={saving}>Importar para revisao</Button>
          </form>
          {accessKeyPreview ? (
            <div className={styles.accessPreview}>
              <span>UF {accessKeyPreview.uf}</span>
              <span>{accessKeyPreview.model}</span>
              <span>{accessKeyPreview.period}</span>
              <span>CNPJ {accessKeyPreview.issuerCnpj}</span>
              <span>Serie {accessKeyPreview.series}</span>
              <span>Numero {accessKeyPreview.number}</span>
            </div>
          ) : (
            <p className={styles.help}>Digite os 44 numeros para conferir modelo, CNPJ emissor, serie e numero antes da importacao.</p>
          )}
          <div className={styles.documentList}>
            {purchaseDocuments.length === 0 ? <EmptyState title="Sem cupons importados" description="Importe uma chave fiscal para revisar os itens antes da entrada." /> : null}
            {purchaseDocuments.map((doc) => (
              <button key={doc.id} type="button" className={`${styles.documentButton} ${selectedDocument?.id === doc.id ? styles.selectedRow : ''}`.trim()} onClick={() => setSelectedDocumentId(doc.id)}>
                <span>
                  <strong>{doc.issuerName ?? doc.issuerCnpj ?? doc.accessKey}</strong>
                  <small>{doc.accessKey}</small>
                </span>
                <span className={styles.documentStats}>
                  <Badge tone={doc.status === 'CONFIRMED' ? 'success' : doc.status === 'READY_TO_CONFIRM' ? 'warning' : 'default'}>{doc.status}</Badge>
                  <em>R$ {Number(doc.totalAmount ?? 0).toFixed(2)}</em>
                  <em>{doc.items?.length ?? 0} itens</em>
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card className={`${styles.card} ${styles.reviewCard}`}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Conferencia</span>
              <h2>Revisao fiscal e mapeamento</h2>
            </div>
            {selectedDocument ? <Badge tone={selectedDocument.status === 'CONFIRMED' ? 'success' : selectedDocument.status === 'READY_TO_CONFIRM' ? 'warning' : 'default'}>{selectedDocument.status}</Badge> : null}
          </div>
          {selectedDocument ? (
            <>
              <div className={styles.documentSummary}>
                <div>
                  <small>Fornecedor fiscal</small>
                  <strong>{selectedDocument.issuerName ?? selectedDocument.issuerCnpj ?? '-'}</strong>
                </div>
                <div>
                  <small>Provider</small>
                  <strong>{selectedDocument.providerName ?? 'nao informado'}</strong>
                </div>
                <div>
                  <small>Total</small>
                  <strong>R$ {Number(selectedDocument.totalAmount ?? 0).toFixed(2)}</strong>
                </div>
                <div>
                  <small>Itens</small>
                  <strong>{selectedDocumentStats.total}</strong>
                </div>
              </div>
              {isLocalFiscalProvider ? (
                <div className={styles.mockNotice}>
                  Os itens abaixo sao gerados pelo provider local de desenvolvimento. Eles nao representam a nota real consultada no portal fiscal.
                </div>
              ) : null}
              <div className={styles.progressStrip}>
                <span>{selectedDocumentStats.mapped} mapeados</span>
                <span>{selectedDocumentStats.unmapped} pendentes</span>
                <span>{selectedDocumentStats.ignored} ignorados</span>
                <span>{strongFiscalSuggestions.length} sugestoes fortes</span>
              </div>
              <div className={styles.fiscalAssistBox}>
                <div>
                  <strong>Mapeamento assistido</strong>
                  <span>O sistema compara a descricao do cupom com os insumos cadastrados e sugere o melhor vinculo. Sempre revise o fator de conversao antes de confirmar estoque.</span>
                </div>
                <Button disabled={saving || strongFiscalSuggestions.length === 0 || selectedDocument.status === 'CONFIRMED'} onClick={() => void onMapStrongFiscalSuggestions()}>
                  Mapear sugestoes fortes
                </Button>
              </div>
              <div className={styles.mappingBar}>
                <label className={styles.field}>
                  <span>Insumo para mapear</span>
                  <select value={mappingStockItemId} onChange={(e) => setMappingStockItemId(e.target.value)}>
                    {rawMaterialItems.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Fator de conversao</span>
                  <Input placeholder="Ex: 1, 0.001, 1000" value={mappingConversionFactor} onChange={(e) => setMappingConversionFactor(e.target.value)} />
                </label>
                <Button disabled={saving || selectedDocument.status !== 'READY_TO_CONFIRM'} onClick={() => void onConfirmFiscalDocument()}>
                  Confirmar estoque
                </Button>
              </div>
              <div className={styles.fiscalItems}>
                {selectedDocument.items.length === 0 ? (
                  <EmptyState title="Sem itens no documento" description="O provider nao retornou itens para esta chave fiscal." />
                ) : null}
                {selectedDocument.items.map((item) => {
                  const suggestion = fiscalItemSuggestions.get(item.id);
                  return (
                  <div key={item.id} className={styles.fiscalItem}>
                    <div className={styles.itemMain}>
                      <Badge tone={item.status === 'CONFIRMED' || item.status === 'MAPPED' ? 'success' : item.status === 'IGNORED' ? 'danger' : 'warning'}>{item.status}</Badge>
                      <strong>{item.description}</strong>
                      {item.mappedStockItemId ? <small>Insumo: {rawMaterialItems.find((stock) => stock.id === item.mappedStockItemId)?.name ?? item.mappedStockItemId}</small> : <small>Sem insumo vinculado</small>}
                      {suggestion ? (
                        <small className={styles.suggestionLine}>
                          Sugestao: {suggestion.stockItem.name} - confianca {(suggestion.confidence * 100).toFixed(0)}%
                        </small>
                      ) : null}
                    </div>
                    <div className={styles.itemNumbers}>
                      <span>Qtd {Number(item.quantity).toFixed(3)} {item.unit ?? ''}</span>
                      <span>Unit R$ {Number(item.unitPrice ?? 0).toFixed(2)}</span>
                      <strong>R$ {Number(item.totalAmount ?? 0).toFixed(2)}</strong>
                    </div>
                    <div className={styles.actions}>
                      <Button disabled={saving || rawMaterialItems.length === 0 || selectedDocument.status === 'CONFIRMED'} onClick={() => void onMapFiscalItem(item.id)}>Mapear</Button>
                      <Button disabled={saving || !suggestion || selectedDocument.status === 'CONFIRMED'} onClick={() => void onMapFiscalItemWithSuggestion(item.id)}>Usar sugestao</Button>
                      <Button disabled={saving || selectedDocument.status === 'CONFIRMED'} variant="danger" onClick={() => void onIgnoreFiscalItem(item.id)}>Ignorar</Button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState title="Selecione uma importacao" description="Importe ou selecione um cupom fiscal para revisar os itens." />
          )}
        </Card>
      </section>

      <section className={styles.operationsGrid}>
        <Card className={`${styles.card} ${styles.systemPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Cadastro comercial</span>
              <h2>Fornecedores</h2>
            </div>
            <div className={styles.panelMetric}>
              <strong>{suppliers.length}</strong>
              <span>cadastrados</span>
            </div>
          </div>
          <form className={styles.compactForm} onSubmit={(e) => void onCreateSupplier(e)}>
            <label className={styles.field}>
              <span>Nome do fornecedor</span>
              <Input placeholder="Ex: Atacadao, mercado local" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Documento</span>
              <Input placeholder="CNPJ ou CPF" value={supplierDocument} onChange={(e) => setSupplierDocument(e.target.value)} />
            </label>
            <Button type="submit" disabled={saving}>Cadastrar</Button>
          </form>
          <div className={styles.entityList}>
            {suppliers.length === 0 ? (
              <div className={styles.emptyCompact}>
                <strong>Nenhum fornecedor cadastrado</strong>
                <span>Cadastre fornecedores para criar pedidos, receber notas e gerar contas a pagar.</span>
              </div>
            ) : null}
            {suppliers.map((row) => (
              <div key={row.id} className={styles.entityRow}>
                <div>
                  <strong>{row.name}</strong>
                  <span>{row.document ?? 'Documento nao informado'}</span>
                </div>
                <div className={styles.rowActions}>
                  <Badge tone={row.active ? 'success' : 'danger'}>{row.active ? 'Ativo' : 'Inativo'}</Badge>
                  <Button disabled={saving} variant={row.active ? 'danger' : 'default'} onClick={() => void onToggleSupplier(row)}>
                    {row.active ? 'Inativar' : 'Reativar'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className={`${styles.card} ${styles.systemPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Pedido rapido</span>
              <h2>Pedido de compra</h2>
            </div>
            <div className={styles.panelMetric}>
              <strong>{orders.length}</strong>
              <span>pedidos</span>
            </div>
          </div>
          <form className={styles.purchaseForm} onSubmit={(e) => void onCreatePurchaseOrder(e)}>
            <label className={styles.field}>
              <span>Fornecedor</span>
              <select value={poSupplierId} onChange={(e) => setPoSupplierId(e.target.value)}>
                <option value="">Selecione</option>
                {suppliers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Insumo</span>
              <select value={poStockItemId} onChange={(e) => setPoStockItemId(e.target.value)}>
                <option value="">Selecione</option>
                {rawMaterialItems.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Quantidade</span>
              <Input placeholder="0,000" value={poQty} onChange={(e) => setPoQty(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Custo unitario</span>
              <Input placeholder="R$ 0,00" value={poUnitCost} onChange={(e) => setPoUnitCost(e.target.value)} />
            </label>
            <Button type="submit" disabled={saving || rawMaterialItems.length === 0}>Criar pedido</Button>
          </form>
          <div className={styles.entityList}>
            {orders.length === 0 ? (
              <div className={styles.emptyCompact}>
                <strong>Nenhum pedido criado</strong>
                <span>O pedido aparece aqui para aprovacao, recebimento e conferencia fiscal.</span>
              </div>
            ) : null}
            {orders.map((row) => (
              <div key={row.id} className={`${styles.entityRow} ${receiveOrderId === row.id ? styles.selectedEntityRow : ''}`.trim()}>
                <button type="button" className={styles.entityButton} onClick={() => setReceiveOrderId(row.id)}>
                  <strong>Pedido {row.id.slice(0, 8)}</strong>
                  <span>{row.supplier?.name ?? row.supplierId}</span>
                </button>
                <div className={styles.rowActions}>
                  <Badge tone={row.status === 'RECEIVED' ? 'success' : row.status === 'CANCELED' ? 'danger' : 'warning'}>{row.status}</Badge>
                  <strong>R$ {Number(row.totalAmount).toFixed(2)}</strong>
                  <Button disabled={saving || row.status !== 'DRAFT'} onClick={() => void onApproveOrder(row)}>Aprovar</Button>
                  <Button disabled={saving || ['CANCELED', 'RECEIVED', 'PARTIALLY_RECEIVED'].includes(row.status)} variant="danger" onClick={() => void onCancelOrder(row)}>Cancelar</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className={`${styles.card} ${styles.systemPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Entrada fisica</span>
              <h2>Recebimento e conferencia</h2>
            </div>
            <Badge tone={selectedOrder ? 'warning' : 'default'}>{selectedOrder ? selectedOrder.status : 'Sem pedido'}</Badge>
          </div>
          <div className={styles.receiptBox}>
            <div className={styles.receiptSummary}>
              <small>Pedido selecionado</small>
              <strong>{selectedOrder ? `#${selectedOrder.id.slice(0, 8)}` : 'Nenhum'}</strong>
              <span>{selectedOrder?.supplier?.name ?? 'Selecione um pedido acima para receber mercadoria.'}</span>
            </div>
            <label className={styles.field}>
              <span>Numero da NF</span>
              <Input placeholder="Opcional" value={receiveInvoice} onChange={(e) => setReceiveInvoice(e.target.value)} />
            </label>
            <Button disabled={saving || !selectedOrder || ['CANCELED', 'RECEIVED', 'PARTIALLY_RECEIVED'].includes(selectedOrder.status)} onClick={() => void onReceiveOrder()}>
              Receber mercadoria
            </Button>
          </div>
          {selectedOrder?.items?.length ? (
            <div className={styles.lineTable}>
              {selectedOrder.items.map((row) => (
                <div key={row.id} className={styles.lineRow}>
                  <strong>{row.stockItem?.name ?? rawMaterialItems.find((stock) => stock.id === row.stockItemId)?.name ?? `Item ${row.stockItemId}`}</strong>
                  <span>{Number(row.quantity).toFixed(3)} {row.unit}</span>
                  <span>R$ {Number(row.unitCost).toFixed(2)}</span>
                  <strong>R$ {Number(row.totalCost).toFixed(2)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyCompact}>
              <strong>Nenhum item para receber</strong>
              <span>Escolha um pedido de compra com itens para conferir a entrada.</span>
            </div>
          )}
        </Card>

        <Card className={`${styles.card} ${styles.systemPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Financeiro</span>
              <h2>Contas a pagar</h2>
            </div>
            <div className={styles.panelMetric}>
              <strong>R$ {(dashboard?.accountsPayable.pendingAmount ?? 0).toFixed(2)}</strong>
              <span>pendente</span>
            </div>
          </div>
          <div className={styles.entityList}>
            {payables.length === 0 ? (
              <div className={styles.emptyCompact}>
                <strong>Nenhuma conta de compra</strong>
                <span>As contas sao geradas apos o recebimento de mercadoria.</span>
              </div>
            ) : null}
            {payables.map((row) => (
              <div key={row.id} className={styles.entityRow}>
                <div>
                  <strong>{row.description}</strong>
                  <span>{row.supplier?.name ?? 'Fornecedor nao informado'} - vence {row.dueDate ? new Date(row.dueDate).toLocaleDateString('pt-BR') : '-'}</span>
                </div>
                <div className={styles.rowActions}>
                  <Badge tone={row.status === 'PENDING' ? 'warning' : 'success'}>{row.status}</Badge>
                  <strong>R$ {Number(row.amount).toFixed(2)}</strong>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className={`${styles.card} ${styles.systemPanel} ${styles.widePanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Inteligencia de compras</span>
              <h2>Historico de custos por insumo</h2>
            </div>
            <span className={styles.panelHint}>Custo medio ponderado das entradas confirmadas</span>
          </div>
          <div className={styles.costGrid}>
            {historySummary.length === 0 ? (
              <div className={styles.emptyCompact}>
                <strong>Sem historico de custos</strong>
                <span>Receba mercadorias ou confirme uma nota fiscal para alimentar comparativos de custo.</span>
              </div>
            ) : null}
            {historySummary.slice(0, 12).map((row) => (
              <div key={row.stockItemId} className={styles.costCard}>
                <strong>{row.stockItemName}</strong>
                <div>
                  <span>Custo medio</span>
                  <b>R$ {Number(row.weightedAverageCost).toFixed(4)}</b>
                </div>
                <div>
                  <span>Ultimo custo</span>
                  <b>R$ {Number(row.lastUnitCost).toFixed(4)}</b>
                </div>
                <small>{Number(row.totalQuantity).toFixed(3)} {row.stockUnit ?? ''} recebidos - {row.samples} amostras</small>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </main>
  );
}
