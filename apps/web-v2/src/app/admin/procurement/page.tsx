'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  confirmPurchaseFiscalDocumentStockEntry,
  createPurchaseOrder,
  createSupplier,
  getFiscalLookupStatus,
  getProcurementDashboard,
  ignorePurchaseFiscalDocumentItem,
  importPurchaseFiscalDocument,
  listAccountsPayable,
  listPurchaseDocuments,
  listPurchaseHistorySummary,
  listPurchaseOrders,
  listSuppliers,
  mapPurchaseFiscalDocumentItem,
  receivePurchaseOrder,
  type FiscalLookupStatus,
  type ProcurementDashboard,
  type PurchaseDocument,
  type PurchaseHistorySummary,
  type PurchaseOrder,
  type Supplier,
  updateSupplier,
  updateSupplierStatus,
} from '@/features/procurement/procurement.api';
import { listStockItems, type StockItem } from '@/features/stock/stock.api';
import styles from './page.module.css';

type PurchaseLine = {
  stockItemId: string;
  quantity: string;
  unitCost: string;
};

type SupplierDraft = {
  id?: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  category: string;
  notes: string;
  active: boolean;
};

type FiscalDocumentMappingDraft = Record<string, {
  stockItemId: string;
  conversionFactor: string;
}>;

const SUPPLIER_CATEGORIES = ['Alimentos', 'Bebidas', 'Embalagens', 'Limpeza', 'Servico', 'Outros'];
const NEW_SUPPLIER_VALUE = '__new_supplier__';

const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function emptyLine(stockItems: StockItem[]): PurchaseLine {
  return {
    stockItemId: stockItems[0]?.id ?? '',
    quantity: '',
    unitCost: '',
  };
}

function formatMoney(value: number | null | undefined) {
  return moneyFormatter.format(Number(value ?? 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function stockItemUnit(item?: StockItem | null) {
  return item?.purchaseUnit || item?.stockUnit || 'UN';
}

function lineTotal(line: PurchaseLine) {
  const quantity = Number(line.quantity || 0);
  const unitCost = Number(line.unitCost || 0);
  return Number.isFinite(quantity) && Number.isFinite(unitCost) ? quantity * unitCost : 0;
}

function orderItemNames(order: PurchaseOrder) {
  const names = (order.items ?? [])
    .map((item) => item.stockItem?.name)
    .filter(Boolean);
  return names.length ? names.join(', ') : '-';
}

function orderInvoiceLabel(order: PurchaseOrder) {
  const notes = (order as PurchaseOrder & { notes?: string | null }).notes ?? '';
  const match = notes.match(/Nota de compra:\s*([^\n]+)/i);
  return match?.[1]?.trim() || order.id.slice(0, 8);
}

function supplierNotes(category: string, notes: string) {
  const cleanCategory = category.trim();
  const cleanNotes = notes.trim();
  return [cleanCategory ? `Categoria: ${cleanCategory}` : '', cleanNotes].filter(Boolean).join('\n');
}

function splitSupplierNotes(notes?: string | null) {
  const value = notes ?? '';
  const match = value.match(/^Categoria:\s*([^\n]+)\n?/i);
  return {
    category: match?.[1]?.trim() ?? '',
    notes: match ? value.replace(/^Categoria:\s*[^\n]+\n?/i, '').trim() : value,
  };
}

function orderStatusTone(status: string): 'success' | 'warning' | 'danger' | 'default' {
  if (['RECEIVED', 'PARTIALLY_RECEIVED'].includes(status)) return 'success';
  if (status === 'CANCELED') return 'danger';
  if (['DRAFT', 'APPROVED', 'SENT'].includes(status)) return 'warning';
  return 'default';
}

function fiscalStatusTone(status: string): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'CONFIRMED') return 'success';
  if (status === 'CANCELED' || status === 'LOOKUP_FAILED') return 'danger';
  if (['PENDING_REVIEW', 'PARTIALLY_MAPPED', 'READY_TO_CONFIRM'].includes(status)) return 'warning';
  return 'default';
}

function normalizeAccessKey(value: string) {
  return value.replace(/\D/g, '').slice(0, 44);
}

export default function AdminProcurementPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [dashboard, setDashboard] = useState<ProcurementDashboard | null>(null);
  const [fiscalLookupStatus, setFiscalLookupStatus] = useState<FiscalLookupStatus | null>(null);
  const [purchaseDocuments, setPurchaseDocuments] = useState<PurchaseDocument[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [payables, setPayables] = useState<Array<{ id: string; description: string; amount: number; status: string; dueDate: string; supplier?: { id: string; name: string } }>>([]);
  const [historySummary, setHistorySummary] = useState<PurchaseHistorySummary[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [purchaseMode, setPurchaseMode] = useState<'create' | 'view'>('create');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayInputValue());
  const [purchaseInvoice, setPurchaseInvoice] = useState('');
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLine[]>([]);

  const [receiveInvoice, setReceiveInvoice] = useState('');

  const [fiscalAccessKey, setFiscalAccessKey] = useState('');
  const [fiscalSupplierId, setFiscalSupplierId] = useState('');
  const [fiscalDocumentType, setFiscalDocumentType] = useState<'NFCE' | 'NFE'>('NFCE');
  const [selectedFiscalDocumentId, setSelectedFiscalDocumentId] = useState('');
  const [fiscalMappingDraft, setFiscalMappingDraft] = useState<FiscalDocumentMappingDraft>({});

  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierDraft, setSupplierDraft] = useState<SupplierDraft>({
    name: '',
    document: '',
    email: '',
    phone: '',
    category: '',
    notes: '',
    active: true,
  });

  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => supplier.active !== false),
    [suppliers],
  );

  const rawMaterialItems = useMemo(
    () => stockItems.filter((item) => item.stockType === 'RAW_MATERIAL' && item.isActive !== false),
    [stockItems],
  );

  const stockItemById = useMemo(
    () => new Map(rawMaterialItems.map((item) => [item.id, item])),
    [rawMaterialItems],
  );

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const purchaseTotal = useMemo(
    () => purchaseLines.reduce((sum, line) => sum + lineTotal(line), 0),
    [purchaseLines],
  );

  const selectedFiscalDocument = useMemo(
    () => purchaseDocuments.find((document) => document.id === selectedFiscalDocumentId) ?? purchaseDocuments[0] ?? null,
    [purchaseDocuments, selectedFiscalDocumentId],
  );

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) => {
      const supplierName = order.supplier?.name ?? suppliers.find((supplier) => supplier.id === order.supplierId)?.name ?? '';
      return [orderInvoiceLabel(order), supplierName, order.status, orderItemNames(order)]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [orders, searchTerm, suppliers]);

  const selectedFiscalDocumentSupplierName = selectedFiscalDocument?.supplierId
    ? suppliers.find((supplier) => supplier.id === selectedFiscalDocument.supplierId)?.name
    : null;

  const fiscalItemsResolved = selectedFiscalDocument?.items.every((item) => item.status !== 'UNMAPPED') ?? false;
  const fiscalItemsMapped = selectedFiscalDocument?.items.filter((item) => item.status === 'MAPPED' || item.status === 'CONFIRMED').length ?? 0;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [supplierData, orderData, stockData, payableData, historyData, dashboardData, lookupData, documentData] = await Promise.all([
        listSuppliers(),
        listPurchaseOrders(),
        listStockItems(),
        listAccountsPayable(),
        listPurchaseHistorySummary(),
        getProcurementDashboard(),
        getFiscalLookupStatus(),
        listPurchaseDocuments(),
      ]);
      const materialItems = stockData.filter((item) => item.stockType === 'RAW_MATERIAL' && item.isActive !== false);
      setSuppliers(supplierData);
      setOrders(orderData);
      setStockItems(stockData);
      setPayables(payableData);
      setHistorySummary(historyData);
      setDashboard(dashboardData);
      setFiscalLookupStatus(lookupData);
      setPurchaseDocuments(documentData);
      if (!purchaseSupplierId && supplierData[0]?.id) setPurchaseSupplierId(supplierData[0].id);
      if (!fiscalSupplierId && supplierData[0]?.id) setFiscalSupplierId(supplierData[0].id);
      if (purchaseLines.length === 0) setPurchaseLines([emptyLine(materialItems)]);
      if (!selectedOrderId && orderData[0]?.id) setSelectedOrderId(orderData[0].id);
      if (!selectedFiscalDocumentId && documentData[0]?.id) setSelectedFiscalDocumentId(documentData[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar compras.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedFiscalDocument) {
      setFiscalMappingDraft({});
      return;
    }
    setFiscalMappingDraft((current) => {
      const next: FiscalDocumentMappingDraft = {};
      for (const item of selectedFiscalDocument.items) {
        next[item.id] = {
          stockItemId: current[item.id]?.stockItemId ?? item.mappedStockItemId ?? rawMaterialItems[0]?.id ?? '',
          conversionFactor: current[item.id]?.conversionFactor ?? String(item.conversionFactor ?? 1),
        };
      }
      return next;
    });
  }, [selectedFiscalDocument, rawMaterialItems]);

  function openPurchaseDialog() {
    setPurchaseMode('create');
    setSelectedOrderId('');
    setPurchaseDate(todayInputValue());
    setPurchaseInvoice('');
    setPurchaseSupplierId(suppliers[0]?.id ?? '');
    setPurchaseLines([emptyLine(rawMaterialItems)]);
    setPurchaseDialogOpen(true);
  }

  function openOrder(order: PurchaseOrder) {
    const invoice = orderInvoiceLabel(order);
    setPurchaseMode('view');
    setSelectedOrderId(order.id);
    setPurchaseDate((order as PurchaseOrder & { expectedDeliveryDate?: string | null }).expectedDeliveryDate?.slice(0, 10) ?? order.createdAt?.slice(0, 10) ?? todayInputValue());
    setPurchaseInvoice(invoice === order.id.slice(0, 8) ? '' : invoice);
    setPurchaseSupplierId(order.supplierId);
    setPurchaseLines((order.items ?? []).map((item) => ({
      stockItemId: item.stockItemId,
      quantity: String(item.quantity ?? ''),
      unitCost: String(item.unitCost ?? ''),
    })));
    setPurchaseDialogOpen(true);
  }

  function openSupplierDialog(supplier?: Supplier) {
    if (supplier) {
      const parsed = splitSupplierNotes(supplier.notes);
      setSupplierDraft({
        id: supplier.id,
        name: supplier.name,
        document: supplier.document ?? '',
        email: supplier.email ?? '',
        phone: supplier.phone ?? '',
        category: parsed.category,
        notes: parsed.notes,
        active: supplier.active !== false,
      });
    } else {
      setSupplierDraft({ name: '', document: '', email: '', phone: '', category: '', notes: '', active: true });
    }
    setSupplierDialogOpen(true);
  }

  function updatePurchaseLine(index: number, patch: Partial<PurchaseLine>) {
    setPurchaseLines((prev) => prev.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  }

  function removePurchaseLine(index: number) {
    setPurchaseLines((prev) => (prev.length <= 1 ? [emptyLine(rawMaterialItems)] : prev.filter((_, lineIndex) => lineIndex !== index)));
  }

  async function saveSupplier() {
    const name = supplierDraft.name.trim();
    if (!name) {
      setError('Informe o nome do fornecedor.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        name,
        document: supplierDraft.document.trim() || undefined,
        email: supplierDraft.email.trim() || undefined,
        phone: supplierDraft.phone.trim() || undefined,
        notes: supplierNotes(supplierDraft.category, supplierDraft.notes) || undefined,
      };
      const saved = supplierDraft.id
        ? await updateSupplier(supplierDraft.id, { ...payload, active: supplierDraft.active })
        : await createSupplier(payload);

      if (supplierDraft.id && saved.active !== supplierDraft.active) {
        await updateSupplierStatus(saved.id, { active: supplierDraft.active });
      }

      setSupplierDialogOpen(false);
      setPurchaseSupplierId(saved.id);
      await load();
      setNotice(supplierDraft.id ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar fornecedor.');
    } finally {
      setSaving(false);
    }
  }

  async function savePurchaseLaunch() {
    if (!purchaseSupplierId) {
      setError('Selecione um fornecedor.');
      return;
    }
    const items = purchaseLines
      .map((line) => ({
        stockItemId: line.stockItemId,
        quantity: Number(line.quantity || 0),
        unitCost: Number(line.unitCost || 0),
        unit: stockItemUnit(stockItemById.get(line.stockItemId)),
      }))
      .filter((line) => line.stockItemId);

    if (!items.length || items.some((item) => item.quantity <= 0 || item.unitCost < 0 || !Number.isFinite(item.quantity) || !Number.isFinite(item.unitCost))) {
      setError('Informe insumo, quantidade e preco unitario em todos os itens.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createPurchaseOrder({
        supplierId: purchaseSupplierId,
        expectedDeliveryDate: purchaseDate || undefined,
        notes: purchaseInvoice.trim() ? `Nota de compra: ${purchaseInvoice.trim()}` : undefined,
        items,
      });

      await approvePurchaseOrder(created.id);
      await receivePurchaseOrder(created.id, {
        invoiceNumber: purchaseInvoice.trim() || undefined,
        items: items.map((item) => ({
          stockItemId: item.stockItemId,
          receivedQuantity: item.quantity,
          orderedQuantity: item.quantity,
          unitCost: item.unitCost,
        })),
      });

      setPurchaseDialogOpen(false);
      await load();
      setNotice('Lancamento salvo, estoque atualizado e conta a pagar gerada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar lancamento de compra.');
    } finally {
      setSaving(false);
    }
  }

  async function receiveSelectedOrder() {
    if (!selectedOrder || !selectedOrder.items?.length) {
      setError('Selecione um pedido com itens para receber.');
      return;
    }
    if (['CANCELED', 'RECEIVED', 'PARTIALLY_RECEIVED'].includes(selectedOrder.status)) {
      setError('Pedido nao esta disponivel para recebimento.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (selectedOrder.status === 'DRAFT') {
        await approvePurchaseOrder(selectedOrder.id);
      }
      await receivePurchaseOrder(selectedOrder.id, {
        invoiceNumber: receiveInvoice || purchaseInvoice || undefined,
        items: selectedOrder.items.map((item) => ({
          stockItemId: item.stockItemId,
          receivedQuantity: Number(item.quantity),
          orderedQuantity: Number(item.quantity),
          unitCost: Number(item.unitCost),
        })),
      });
      setReceiveInvoice('');
      setPurchaseDialogOpen(false);
      await load();
      setNotice('Mercadoria recebida e estoque atualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao receber mercadoria.');
    } finally {
      setSaving(false);
    }
  }

  async function cancelSelectedOrder() {
    if (!selectedOrder) return;
    if (!window.confirm('Excluir esta nota/pedido? Ela sera cancelada para preservar historico.')) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await cancelPurchaseOrder(selectedOrder.id);
      setPurchaseDialogOpen(false);
      await load();
      setNotice('Nota de compra cancelada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cancelar nota.');
    } finally {
      setSaving(false);
    }
  }

  async function importFiscalDocument() {
    const accessKey = normalizeAccessKey(fiscalAccessKey);
    if (accessKey.length !== 44) {
      setError('Informe a chave fiscal com 44 digitos.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const document = await importPurchaseFiscalDocument({
        accessKey,
        supplierId: fiscalSupplierId || undefined,
        documentType: fiscalDocumentType,
      });
      setFiscalAccessKey('');
      setSelectedFiscalDocumentId(document.id);
      await load();
      setNotice('Cupom fiscal importado para revisao.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao importar cupom fiscal.');
    } finally {
      setSaving(false);
    }
  }

  function updateFiscalMappingDraft(itemId: string, patch: Partial<FiscalDocumentMappingDraft[string]>) {
    setFiscalMappingDraft((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { stockItemId: '', conversionFactor: '1' }), ...patch },
    }));
  }

  async function mapFiscalItem(itemId: string) {
    if (!selectedFiscalDocument) return;
    const draft = fiscalMappingDraft[itemId];
    const stockItemId = draft?.stockItemId ?? '';
    const conversionFactor = Number(draft?.conversionFactor || 1);
    if (!stockItemId) {
      setError('Selecione um insumo para mapear o item fiscal.');
      return;
    }
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) {
      setError('Informe um fator de conversao maior que zero.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await mapPurchaseFiscalDocumentItem(selectedFiscalDocument.id, itemId, { stockItemId, conversionFactor });
      await load();
      setNotice('Item fiscal mapeado para insumo.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao mapear item fiscal.');
    } finally {
      setSaving(false);
    }
  }

  async function ignoreFiscalItem(itemId: string) {
    if (!selectedFiscalDocument) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await ignorePurchaseFiscalDocumentItem(selectedFiscalDocument.id, itemId);
      await load();
      setNotice('Item fiscal ignorado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ignorar item fiscal.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmFiscalDocument() {
    if (!selectedFiscalDocument) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await confirmPurchaseFiscalDocumentStockEntry(selectedFiscalDocument.id);
      await load();
      setNotice(result.confirmed ? `Entrada fiscal confirmada. Conta a pagar: ${result.payableId ?? 'gerada'}.` : 'Documento fiscal ja estava processado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao confirmar entrada fiscal.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Carregando compras..." />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="Compras e Fornecedores"
        subtitle="Fornecedores, pedidos, recebimento, cotacao e contas a pagar"
        right={
          <div className={styles.headerActions}>
            <Button onClick={() => openSupplierDialog()}>Cadastro de Fornecedores</Button>
            <Button variant="primary" onClick={openPurchaseDialog}>Lancamento de Compras</Button>
            <Button onClick={() => void load()}>Atualizar</Button>
          </div>
        }
      />

      {error ? (
        <div className={styles.errorBox}>
          <strong>Erro</strong>
          <span>{error}</span>
        </div>
      ) : null}
      {notice ? (
        <div className={styles.successBox}>
          <strong>OK</strong>
          <span>{notice}</span>
        </div>
      ) : null}

      <section className={styles.metricGrid}>
        <Card className={styles.metricCard}>
          <span>Fornecedores ativos</span>
          <strong>{dashboard?.suppliers.active ?? suppliers.filter((supplier) => supplier.active !== false).length}</strong>
          <small>{dashboard?.suppliers.inactive ?? suppliers.filter((supplier) => supplier.active === false).length} inativos cadastrados</small>
        </Card>
        <Card className={styles.metricCard}>
          <span>Pedidos em aberto</span>
          <strong>{dashboard?.purchaseOrders.open ?? orders.filter((order) => !['RECEIVED', 'PARTIALLY_RECEIVED', 'CANCELED'].includes(order.status)).length}</strong>
          <small>Compra, aprovacao e recebimento</small>
        </Card>
        <Card className={styles.metricCard}>
          <span>Compras 30 dias</span>
          <strong>{formatMoney(dashboard?.purchaseOrders.totalLast30Days ?? 0)}</strong>
          <small>Pedidos nao cancelados recentes</small>
        </Card>
        <Card className={styles.metricCard}>
          <span>Fiscal em revisao</span>
          <strong>{dashboard?.fiscalDocuments.pendingReview ?? purchaseDocuments.filter((document) => document.status !== 'CONFIRMED').length}</strong>
          <small>{dashboard?.fiscalDocuments.readyToConfirm ?? 0} prontos para confirmar</small>
        </Card>
        <Card className={styles.metricCard}>
          <span>A pagar compras</span>
          <strong>{formatMoney(dashboard?.accountsPayable.pendingAmount ?? payables.reduce((sum, item) => sum + Number(item.amount ?? 0), 0))}</strong>
          <small>{dashboard?.accountsPayable.pending ?? payables.length} pendentes</small>
        </Card>
        <Card className={styles.metricCard}>
          <span>Vencidas</span>
          <strong>{dashboard?.accountsPayable.overdue ?? payables.filter((item) => item.status === 'OVERDUE').length}</strong>
          <small>Contas de compras em atraso</small>
        </Card>
      </section>

      <Card className={styles.dataPanel}>
        <div className={styles.dataHeader}>
          <div>
            <span id="sheetName">12_COMPRAS</span>
            <h2 id="tableTitle">Compras</h2>
          </div>
          <label className={styles.searchBox}>
            <span>Buscar</span>
            <Input placeholder="Fornecedor, nota, insumo..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
          </label>
        </div>
        <div className={styles.dataStatus}>{filteredOrders.length} registros carregados</div>
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Nota de compra</th>
                <th>Fornecedor</th>
                <th>Qtd. itens</th>
                <th>Insumos vinculados</th>
                <th>Total (R$)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.emptyCell}>Nenhum lancamento de compra cadastrado.</td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>
                      <button type="button" className={styles.tableLink} onClick={() => openOrder(order)}>
                        {orderInvoiceLabel(order)}
                      </button>
                    </td>
                    <td>{order.supplier?.name ?? suppliers.find((supplier) => supplier.id === order.supplierId)?.name ?? '-'}</td>
                    <td>{order.items?.length ?? 0}</td>
                    <td>{orderItemNames(order)}</td>
                    <td>{formatMoney(order.totalAmount)}</td>
                    <td><Badge tone={orderStatusTone(order.status)}>{order.status}</Badge></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <section className={styles.supportGrid}>
        <Card className={styles.supportPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Entrada por nota</span>
              <h2>Importar cupom fiscal</h2>
            </div>
            <Badge tone={fiscalLookupStatus?.realLookupEnabled ? 'success' : 'warning'}>
              {fiscalLookupStatus?.providerName ?? 'Provider local'}
            </Badge>
          </div>

          {!fiscalLookupStatus?.realLookupEnabled ? (
            <div className={styles.fiscalNotice}>
              <strong>Consulta real ainda nao configurada.</strong>
              <span>O DEV usa provider local/mock. A chave e validada e o sistema cria uma pre-importacao para revisao.</span>
            </div>
          ) : null}

          <div className={styles.fiscalForm}>
            <label className={styles.field}>
              <span>Chave de acesso</span>
              <Input
                placeholder="44 digitos da NFC-e"
                value={fiscalAccessKey}
                onChange={(event) => setFiscalAccessKey(normalizeAccessKey(event.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span>Fornecedor vinculado</span>
              <select value={fiscalSupplierId} onChange={(event) => setFiscalSupplierId(event.target.value)}>
                <option value="">Fornecedor opcional</option>
                {activeSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Documento</span>
              <select value={fiscalDocumentType} onChange={(event) => setFiscalDocumentType(event.target.value as 'NFCE' | 'NFE')}>
                <option value="NFCE">NFC-e</option>
                <option value="NFE">NF-e</option>
              </select>
            </label>
            <Button disabled={saving} onClick={() => void importFiscalDocument()}>Importar para revisao</Button>
          </div>

          <div className={styles.entityList}>
            {purchaseDocuments.length === 0 ? <div className={styles.emptyBox}>Sem documentos fiscais importados.</div> : null}
            {purchaseDocuments.slice(0, 6).map((document) => (
              <button
                key={document.id}
                type="button"
                className={`${styles.documentRow} ${selectedFiscalDocument?.id === document.id ? styles.selectedRow : ''}`}
                onClick={() => setSelectedFiscalDocumentId(document.id)}
              >
                <div>
                  <strong>{document.issuerName ?? 'Fornecedor fiscal'}</strong>
                  <span>{document.accessKey}</span>
                </div>
                <Badge tone={fiscalStatusTone(document.status)}>{document.status}</Badge>
                <b>{formatMoney(document.totalAmount)}</b>
                <span>{document.items.length} itens</span>
              </button>
            ))}
          </div>
        </Card>

        <Card className={styles.supportPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Conferencia</span>
              <h2>Revisao fiscal e mapeamento</h2>
            </div>
            <Badge tone={selectedFiscalDocument ? fiscalStatusTone(selectedFiscalDocument.status) : 'default'}>
              {selectedFiscalDocument?.status ?? 'Sem documento'}
            </Badge>
          </div>

          {selectedFiscalDocument ? (
            <>
              <div className={styles.reviewSummary}>
                <div>
                  <span>Fornecedor fiscal</span>
                  <strong>{selectedFiscalDocument.issuerName ?? selectedFiscalDocumentSupplierName ?? '-'}</strong>
                </div>
                <div>
                  <span>Provider</span>
                  <strong>{selectedFiscalDocument.providerName ?? '-'}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{formatMoney(selectedFiscalDocument.totalAmount)}</strong>
                </div>
                <div>
                  <span>Itens</span>
                  <strong>{selectedFiscalDocument.items.length}</strong>
                </div>
              </div>
              <div className={styles.mappingStatus}>
                <Badge tone="success">{fiscalItemsMapped} mapeados</Badge>
                <Badge>{selectedFiscalDocument.items.filter((item) => item.status === 'UNMAPPED').length} pendentes</Badge>
                <Badge>{selectedFiscalDocument.items.filter((item) => item.status === 'IGNORED').length} ignorados</Badge>
              </div>
              <div className={styles.fiscalItemList}>
                {selectedFiscalDocument.items.map((item) => {
                  const draft = fiscalMappingDraft[item.id] ?? { stockItemId: item.mappedStockItemId ?? rawMaterialItems[0]?.id ?? '', conversionFactor: String(item.conversionFactor ?? 1) };
                  return (
                    <div key={item.id} className={styles.fiscalItemRow}>
                      <div className={styles.itemMeta}>
                        <Badge tone={item.status === 'MAPPED' || item.status === 'CONFIRMED' ? 'success' : item.status === 'IGNORED' ? 'danger' : 'warning'}>{item.status}</Badge>
                        <strong>{item.description}</strong>
                        <span>Qtd {Number(item.quantity ?? 0).toFixed(3)} {item.unit ?? ''} - Unit {formatMoney(item.unitPrice)} - Total {formatMoney(item.totalAmount)}</span>
                      </div>
                      <div className={styles.itemControls}>
                        <label className={styles.field}>
                          <span>Insumo para mapear</span>
                          <select value={draft.stockItemId} disabled={item.status === 'CONFIRMED'} onChange={(event) => updateFiscalMappingDraft(item.id, { stockItemId: event.target.value })}>
                            <option value="">Selecione...</option>
                            {rawMaterialItems.map((stockItem) => (
                              <option key={stockItem.id} value={stockItem.id}>{stockItem.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.field}>
                          <span>Fator de conversao</span>
                          <Input value={draft.conversionFactor} disabled={item.status === 'CONFIRMED'} inputMode="decimal" onChange={(event) => updateFiscalMappingDraft(item.id, { conversionFactor: event.target.value })} />
                        </label>
                        <div className={styles.inlineActions}>
                          <Button disabled={saving || item.status === 'CONFIRMED'} onClick={() => void mapFiscalItem(item.id)}>Mapear</Button>
                          <Button variant="danger" disabled={saving || item.status === 'CONFIRMED'} onClick={() => void ignoreFiscalItem(item.id)}>Ignorar</Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className={styles.confirmLine}>
                <span>{fiscalItemsResolved ? 'Todos os itens estao mapeados ou ignorados.' : 'Mapeie ou ignore todos os itens para confirmar a entrada.'}</span>
                <Button variant="primary" disabled={saving || !fiscalItemsResolved || selectedFiscalDocument.status === 'CONFIRMED'} onClick={() => void confirmFiscalDocument()}>
                  Confirmar estoque
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.emptyBox}>Importe uma chave fiscal para revisar os itens antes da entrada.</div>
          )}
        </Card>

        <Card className={styles.supportPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Recebimento e conferencia</span>
              <h2>Entrada de mercadoria</h2>
            </div>
            <Badge>{selectedOrder?.status ?? 'Sem pedido'}</Badge>
          </div>
          <div className={styles.receiptForm}>
            <select value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)}>
              <option value="">Pedido selecionado</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {orderInvoiceLabel(order)} - {order.supplier?.name ?? 'Fornecedor'}
                </option>
              ))}
            </select>
            <Input placeholder="Numero da NF" value={receiveInvoice} onChange={(event) => setReceiveInvoice(event.target.value)} />
            <Button disabled={saving || !selectedOrder} onClick={() => void receiveSelectedOrder()}>Receber mercadoria</Button>
          </div>
          {selectedOrder?.items?.length ? (
            <div className={styles.receiptLines}>
              {selectedOrder.items.map((item) => (
                <div key={item.id}>
                  <strong>{item.stockItem?.name ?? item.stockItemId}</strong>
                  <span>{Number(item.quantity).toFixed(3)} {item.unit}</span>
                  <span>{formatMoney(item.unitCost)}</span>
                  <b>{formatMoney(item.totalCost)}</b>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyBox}>Escolha um pedido para receber e conferir nota/entrada.</div>
          )}
        </Card>

        <Card className={styles.supportPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Financeiro</span>
              <h2>Contas a pagar por compra</h2>
            </div>
            <Badge>{payables.length} contas</Badge>
          </div>
          <div className={styles.entityList}>
            {payables.length === 0 ? <div className={styles.emptyBox}>Sem contas a pagar.</div> : null}
            {payables.map((item) => (
              <div key={item.id} className={styles.entityRow}>
                <div>
                  <strong>{item.description}</strong>
                  <span>{item.supplier?.name ?? 'Fornecedor nao informado'} - vence {formatDate(item.dueDate)}</span>
                </div>
                <div>
                  <Badge tone={item.status === 'PENDING' ? 'warning' : 'success'}>{item.status}</Badge>
                  <strong>{formatMoney(item.amount)}</strong>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className={`${styles.supportPanel} ${styles.widePanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span>Historico</span>
              <h2>Historico de custos por insumo</h2>
            </div>
          </div>
          <div className={styles.costGrid}>
            {historySummary.length === 0 ? <div className={styles.emptyBox}>Sem historico de custos.</div> : null}
            {historySummary.slice(0, 12).map((item) => (
              <div key={item.stockItemId} className={styles.costCard}>
                <strong>{item.stockItemName}</strong>
                <span>Custo medio: <b>{formatMoney(item.weightedAverageCost)}</b></span>
                <span>Ultimo custo: <b>{formatMoney(item.lastUnitCost)}</b></span>
                <small>{Number(item.totalQuantity).toFixed(3)} {item.stockUnit ?? ''} recebidos</small>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {purchaseDialogOpen ? (
        <div className={styles.modalBackdrop} role="presentation">
          <section className={styles.purchaseDialog} role="dialog" aria-modal="true" aria-labelledby="purchaseDialogTitle">
            <header className={styles.dialogHeader}>
              <div>
                <span>REGISTRO</span>
                <h2 id="purchaseDialogTitle">{purchaseMode === 'create' ? 'Lancamento de Compras' : 'Atualizar Compra'}</h2>
              </div>
              <button type="button" className={styles.closeButton} aria-label="Fechar" onClick={() => setPurchaseDialogOpen(false)}>x</button>
            </header>
            <div className={styles.dialogBody}>
              <div className={styles.purchaseFields}>
                <label className={styles.field}>
                  <span>Data da compra</span>
                  <Input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} disabled={purchaseMode === 'view'} />
                </label>
                <label className={styles.field}>
                  <span>Fornecedor</span>
                  <select
                    value={purchaseSupplierId}
                    onChange={(event) => {
                      if (event.target.value === NEW_SUPPLIER_VALUE) {
                        openSupplierDialog();
                        return;
                      }
                      setPurchaseSupplierId(event.target.value);
                    }}
                    disabled={purchaseMode === 'view'}
                  >
                    <option value="">Selecione...</option>
                    {activeSuppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                    <option value={NEW_SUPPLIER_VALUE}>+ Cadastrar novo fornecedor...</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Nota de compra</span>
                  <Input value={purchaseInvoice} onChange={(event) => setPurchaseInvoice(event.target.value)} disabled={purchaseMode === 'view'} placeholder="Numero da nota" />
                </label>
              </div>

              <div className={styles.itemsToolbar}>
                <h3>Itens da compra</h3>
                <Button disabled={purchaseMode === 'view'} onClick={() => setPurchaseLines((prev) => [...prev, emptyLine(rawMaterialItems)])}>Adicionar Insumo</Button>
              </div>
              <div className={styles.itemsWrap}>
                <table className={styles.itemTable}>
                  <thead>
                    <tr>
                      <th>Insumo</th>
                      <th>Qtd</th>
                      <th>Unid. auto</th>
                      <th>Preco unit. pago (R$)</th>
                      <th>Total auto</th>
                      <th>Var. preco auto</th>
                      <th>Remover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseLines.map((line, index) => {
                      const item = stockItemById.get(line.stockItemId);
                      const averageCost = Number(item?.averageCost ?? 0);
                      const unitCost = Number(line.unitCost || 0);
                      const variation = averageCost > 0 && unitCost > 0 ? ((unitCost - averageCost) / averageCost) * 100 : null;
                      return (
                        <tr key={`${line.stockItemId}-${index}`}>
                          <td>
                            <select value={line.stockItemId} disabled={purchaseMode === 'view'} onChange={(event) => updatePurchaseLine(index, { stockItemId: event.target.value })}>
                              <option value="">Selecione...</option>
                              {rawMaterialItems.map((stockItem) => (
                                <option key={stockItem.id} value={stockItem.id}>{stockItem.name}</option>
                              ))}
                            </select>
                          </td>
                          <td><Input disabled={purchaseMode === 'view'} value={line.quantity} inputMode="decimal" onChange={(event) => updatePurchaseLine(index, { quantity: event.target.value })} /></td>
                          <td>{stockItemUnit(item)}</td>
                          <td><Input disabled={purchaseMode === 'view'} value={line.unitCost} inputMode="decimal" onChange={(event) => updatePurchaseLine(index, { unitCost: event.target.value })} /></td>
                          <td>{formatMoney(lineTotal(line))}</td>
                          <td>{variation === null ? '-' : `${variation.toFixed(1).replace('.', ',')}%`}</td>
                          <td><button type="button" className={styles.removeButton} disabled={purchaseMode === 'view'} onClick={() => removePurchaseLine(index)}>x</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className={styles.purchaseTotal}>Total da compra: <strong>{formatMoney(purchaseTotal)}</strong></div>
            </div>
            <footer className={styles.dialogFooter}>
              {purchaseMode === 'view' && selectedOrder && !['CANCELED', 'RECEIVED', 'PARTIALLY_RECEIVED'].includes(selectedOrder.status) ? (
                <button type="button" className={styles.dangerButton} disabled={saving} onClick={() => void cancelSelectedOrder()}>Excluir Nota</button>
              ) : <span />}
              <span />
              {purchaseMode === 'view' && selectedOrder && !['CANCELED', 'RECEIVED', 'PARTIALLY_RECEIVED'].includes(selectedOrder.status) ? (
                <Button disabled={saving} onClick={() => void receiveSelectedOrder()}>Receber mercadoria</Button>
              ) : null}
              <Button onClick={() => setPurchaseDialogOpen(false)}>Cancelar</Button>
              {purchaseMode === 'create' ? (
                <Button variant="primary" disabled={saving || rawMaterialItems.length === 0} onClick={() => void savePurchaseLaunch()}>
                  {saving ? 'Salvando...' : 'Salvar Lancamento'}
                </Button>
              ) : null}
            </footer>
          </section>
        </div>
      ) : null}

      {supplierDialogOpen ? (
        <div className={styles.modalBackdrop} role="presentation">
          <section className={styles.supplierDialog} role="dialog" aria-modal="true" aria-labelledby="supplierDialogTitle">
            <header className={styles.dialogHeader}>
              <div>
                <span>FORNECEDORES</span>
                <h2 id="supplierDialogTitle">Cadastro de Fornecedores</h2>
              </div>
              <button type="button" className={styles.closeButton} aria-label="Fechar" onClick={() => setSupplierDialogOpen(false)}>x</button>
            </header>
            <div className={styles.dialogBody}>
              <div className={styles.supplierGrid}>
                <label className={styles.field}>
                  <span>ID automatico</span>
                  <Input value={supplierDraft.id?.slice(0, 8) ?? 'Automatico'} disabled />
                </label>
                <label className={styles.field}>
                  <span>Nome</span>
                  <Input value={supplierDraft.name} onChange={(event) => setSupplierDraft((prev) => ({ ...prev, name: event.target.value }))} />
                </label>
                <label className={styles.field}>
                  <span>Documento</span>
                  <Input value={supplierDraft.document} onChange={(event) => setSupplierDraft((prev) => ({ ...prev, document: event.target.value }))} />
                </label>
                <label className={styles.field}>
                  <span>Telefone</span>
                  <Input value={supplierDraft.phone} onChange={(event) => setSupplierDraft((prev) => ({ ...prev, phone: event.target.value }))} />
                </label>
                <label className={styles.field}>
                  <span>E-mail</span>
                  <Input value={supplierDraft.email} onChange={(event) => setSupplierDraft((prev) => ({ ...prev, email: event.target.value }))} />
                </label>
                <label className={styles.field}>
                  <span>Categoria</span>
                  <select value={supplierDraft.category} onChange={(event) => setSupplierDraft((prev) => ({ ...prev, category: event.target.value }))}>
                    <option value="">Selecione...</option>
                    {SUPPLIER_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Ativo</span>
                  <select value={supplierDraft.active ? 'yes' : 'no'} onChange={(event) => setSupplierDraft((prev) => ({ ...prev, active: event.target.value === 'yes' }))}>
                    <option value="yes">Sim</option>
                    <option value="no">Nao</option>
                  </select>
                </label>
                <label className={`${styles.field} ${styles.wideField}`}>
                  <span>Observacoes</span>
                  <textarea value={supplierDraft.notes} onChange={(event) => setSupplierDraft((prev) => ({ ...prev, notes: event.target.value }))} />
                </label>
              </div>

              <div className={styles.supplierList}>
                {suppliers.length === 0 ? <div className={styles.emptyBox}>Sem fornecedores cadastrados.</div> : null}
                {suppliers.map((supplier) => (
                  <button key={supplier.id} type="button" className={styles.supplierRow} onClick={() => openSupplierDialog(supplier)}>
                    <span>{supplier.id.slice(0, 8)}</span>
                    <strong>{supplier.name}</strong>
                    <span>{supplier.phone ?? '-'}</span>
                    <span>{splitSupplierNotes(supplier.notes).category || '-'}</span>
                    <Badge tone={supplier.active ? 'success' : 'danger'}>{supplier.active ? 'Ativo' : 'Inativo'}</Badge>
                  </button>
                ))}
              </div>
            </div>
            <footer className={styles.dialogFooter}>
              {supplierDraft.id ? (
                <button type="button" className={styles.dangerButton} disabled={saving} onClick={() => setSupplierDraft((prev) => ({ ...prev, active: false }))}>Excluir Fornecedor</button>
              ) : <span />}
              <span />
              <Button onClick={() => setSupplierDraft({ name: '', document: '', email: '', phone: '', category: '', notes: '', active: true })}>Novo</Button>
              <Button onClick={() => setSupplierDialogOpen(false)}>Cancelar</Button>
              <Button variant="primary" disabled={saving} onClick={() => void saveSupplier()}>{saving ? 'Salvando...' : 'Salvar Fornecedor'}</Button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
