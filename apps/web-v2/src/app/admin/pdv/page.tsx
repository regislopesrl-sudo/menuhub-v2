'use client';

import { useMemo, useRef, useState } from 'react';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useEffect } from 'react';
import {
  closePdvSession,
  createPdvMovement,
  createPdvOrder,
  fetchPdvMenu,
  getCurrentOpenPdvSession,
  getPdvOperatorSummary,
  getCurrentPdvSessionSummary,
  getPdvSessionDivergence,
  getPdvSessionSummary,
  listCurrentPdvMovements,
  listPdvMovements,
  openPdvSession,
  type PdvMovementType,
  type PdvSessionMovement,
  type PdvCheckoutPayload,
  type PdvPaymentMethod,
  type PdvSessionSummary,
  type PdvOperatorSummary,
  type PdvSessionDivergence,
} from '@/features/pdv/pdv.api';
import type { MenuProduct } from '@/features/menu/menu.mock';
import { Input, Select } from '@/components/ui/Input';
import { useModuleAccess } from '@/features/modules/use-module-access';
import { ModuleDisabled } from '@/components/module-disabled';

interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  addons: Array<{
    groupId: string;
    optionId: string;
    name: string;
    price: number;
  }>;
}

function currency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function isProductEnabledForPdv(product: MenuProduct) {
  return product.available !== false && product.channels?.pdv !== false && product.stockAvailabilityStatus !== 'out_of_stock';
}

function isTechnicalStockLimited(product?: MenuProduct | null) {
  return product?.stockAvailabilityStatus === 'available' || product?.stockAvailabilityStatus === 'low_stock';
}

function cartQuantityForProduct(cart: CartItem[], productId: string) {
  return cart
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + item.quantity, 0);
}

function canIncreaseProductQuantity(product: MenuProduct | undefined, currentQuantity: number) {
  if (!product) return true;
  if (product.stockAvailabilityStatus === 'out_of_stock') return false;
  if (!isTechnicalStockLimited(product) || typeof product.availableToSell !== 'number') return true;
  return currentQuantity < product.availableToSell;
}

function pdvProductStatusClass(product: MenuProduct, enabled: boolean) {
  if (!enabled || product.stockAvailabilityStatus === 'out_of_stock') return styles.statusInactive;
  if (product.stockAvailabilityStatus === 'low_stock') return styles.statusWarning;
  if (product.stockAvailabilityStatus === 'missing_recipe' || product.stockAvailabilityStatus === 'recipe_without_stock_items') {
    return styles.statusInfo;
  }
  return styles.statusActive;
}

function pdvProductStatusText(product: MenuProduct, enabled: boolean) {
  if (!enabled && product.stockAvailabilityStatus !== 'out_of_stock') return 'Desativado';
  return product.stockStatusLabel ?? (enabled ? 'Ativo' : 'Desativado');
}

type PdvSaleType = 'COUNTER' | 'TABLE' | 'COMMAND';

export default function AdminPdvPage() {
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const storeId = 'pdv-store';
  const operatorName = 'Operador local';
  const access = useModuleAccess({ companyId, branchId, userRole: 'admin' }, 'pdv');

  const [menu, setMenu] = useState<MenuProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PdvPaymentMethod>('CASH');
  const [saleType, setSaleType] = useState<PdvSaleType | ''>('');
  const [commandReference, setCommandReference] = useState('');
  const [startInPreparation, setStartInPreparation] = useState(true);
  const [lastOrder, setLastOrder] = useState<{
    id: string;
    status: string;
    saleType: PdvSaleType;
    commandReference?: string;
    qrCode?: string;
    qrCodeText?: string;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [customizingProduct, setCustomizingProduct] = useState<MenuProduct | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionActionLoading, setSessionActionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [openSession, setOpenSession] = useState<{
    id: string;
    branchId: string;
    status: string;
    openedAt: string;
    openingBalance: number;
  } | null>(null);
  const [sessionSummary, setSessionSummary] = useState<PdvSessionSummary | null>(null);
  const [openingBalanceInput, setOpeningBalanceInput] = useState('0');
  const [declaredCashInput, setDeclaredCashInput] = useState('');
  const [closureNotesInput, setClosureNotesInput] = useState('');
  const [movements, setMovements] = useState<PdvSessionMovement[]>([]);
  const [operatorSummary, setOperatorSummary] = useState<PdvOperatorSummary | null>(null);
  const [sessionDivergence, setSessionDivergence] = useState<PdvSessionDivergence | null>(null);
  const [movementType, setMovementType] = useState<PdvMovementType>('SUPPLY');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const finalizeRef = useRef<() => void>(() => undefined);

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum +
          item.quantity *
            (item.unitPrice + item.addons.reduce((addonSum, addon) => addonSum + addon.price, 0)),
        0,
      ),
    [cart],
  );
  const selectedSaleType = saleType || null;
  const isCounterSale = selectedSaleType === 'COUNTER';
  const isDeferredSale = selectedSaleType === 'TABLE' || selectedSaleType === 'COMMAND';
  const saleTypeLabel = selectedSaleType === 'TABLE' ? 'Mesa' : selectedSaleType === 'COMMAND' ? 'Comanda' : 'Balcao';
  const categories = useMemo(
    () => ['all', ...Array.from(new Set(menu.map((item) => item.categoryName || 'Sem categoria')))],
    [menu],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>([['all', menu.length]]);
    menu.forEach((item) => {
      const name = item.categoryName || 'Sem categoria';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return counts;
  }, [menu]);
  const filteredMenu = useMemo(
    () =>
      menu.filter((product) => {
        const matchesCategory = category === 'all' || (product.categoryName || 'Sem categoria') === category;
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          product.name.toLowerCase().includes(q) ||
          product.description.toLowerCase().includes(q);
        return matchesCategory && matchesSearch;
      }),
    [menu, category, search],
  );

  useEffect(() => {
    const load = async () => {
      if (access.loading || !access.allowed) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await fetchPdvMenu({ companyId, branchId });
        setMenu(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar cardapio.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [access.allowed, access.loading, branchId, companyId]);

  useEffect(() => {
    const loadSession = async () => {
      if (access.loading || !access.allowed) {
        setSessionLoading(false);
        return;
      }

      setSessionLoading(true);
      setSessionError(null);
      try {
        const current = await getCurrentOpenPdvSession({ companyId, branchId });
        if (current) {
          setOpenSession(current);
          const [summary, movementList] = await Promise.all([
            getCurrentPdvSessionSummary({
              companyId,
              branchId,
            }),
            listCurrentPdvMovements({
              companyId,
              branchId,
            }),
          ]);
          setSessionSummary(summary);
          setMovements(movementList);
          if (summary?.sessionId) {
            const [operator, divergence] = await Promise.all([
              getPdvOperatorSummary({
                companyId,
                branchId,
                sessionId: summary.sessionId,
              }),
              getPdvSessionDivergence({
                companyId,
                branchId,
                sessionId: summary.sessionId,
              }),
            ]);
            setOperatorSummary(operator);
            setSessionDivergence(divergence);
          }
        } else {
          setOpenSession(null);
          setSessionSummary(null);
          setMovements([]);
          setOperatorSummary(null);
          setSessionDivergence(null);
        }
      } catch (err) {
        setSessionError(err instanceof Error ? err.message : 'Falha ao carregar sessao de caixa.');
      } finally {
        setSessionLoading(false);
      }
    };
    void loadSession();
  }, [access.allowed, access.loading, branchId, companyId]);

  useEffect(() => {
    if (access.loading || !access.allowed || !openSession?.id) return;
    const id = setInterval(async () => {
      try {
        const summary = await getPdvSessionSummary({
          companyId,
          branchId,
          sessionId: openSession.id,
        });
        setSessionSummary(summary);
        const [movementList, operator, divergence] = await Promise.all([
          listPdvMovements({
            companyId,
            branchId,
            sessionId: openSession.id,
          }),
          getPdvOperatorSummary({
            companyId,
            branchId,
            sessionId: openSession.id,
          }),
          getPdvSessionDivergence({
            companyId,
            branchId,
            sessionId: openSession.id,
          }),
        ]);
        setMovements(movementList);
        setOperatorSummary(operator);
        setSessionDivergence(divergence);
      } catch {
        // non-blocking polling
      }
    }, 5000);
    return () => clearInterval(id);
  }, [access.allowed, access.loading, branchId, companyId, openSession?.id]);


  useEffect(() => {
    if (access.loading || !access.allowed) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;

      if (event.key === 'F2') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[data-pdv-product-search="true"]')?.focus();
        return;
      }
      if (isTyping) return;
      if (event.key === 'F4') {
        event.preventDefault();
        if (cart.length > 0 && openSession?.id && !finishing) {
          void finalizeRef.current();
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (customizingProduct) {
          setCustomizingProduct(null);
          setSelectedAddons([]);
          return;
        }
        setSearch('');
        setCategory('all');
        setCheckoutError(null);
        setLastOrder(null);
        return;
      }
      if (event.key === 'Enter' && customizingProduct) {
        event.preventDefault();
        confirmCustomize();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [access.allowed, access.loading, cart.length, customizingProduct, finishing, openSession?.id]);

  if (access.loading) {
    return <main className={styles.page}><LoadingState label="Validando acesso ao mÃ³dulo..." /></main>;
  }
  if (!access.allowed) {
    return <ModuleDisabled moduleName="PDV" reason={access.error ?? 'MÃ³dulo PDV desativado.'} />;
  }

  const addItem = (
    product: MenuProduct,
    addons: Array<{ groupId: string; optionId: string; name: string; price: number }> = [],
  ) => {
    const currentQuantity = cartQuantityForProduct(cart, product.id);
    if (!canIncreaseProductQuantity(product, currentQuantity)) {
      setCheckoutError(
        product.stockAvailabilityStatus === 'out_of_stock'
          ? `${product.name} esta sem estoque disponivel.`
          : `Limite de estoque disponivel para ${product.name}: ${product.availableToSell}.`,
      );
      return;
    }
    setCheckoutError(null);
    setCart((prev) => {
      const addonKey = addons
        .map((addon) => `${addon.groupId}:${addon.optionId}`)
        .sort()
        .join('|');
      const found = prev.find(
        (item) =>
          item.productId === product.id &&
          item.addons
            .map((addon) => `${addon.groupId}:${addon.optionId}`)
            .sort()
            .join('|') === addonKey,
      );
      if (found) {
        return prev.map((item) =>
          item === found ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...prev, { productId: product.id, name: product.name, unitPrice: product.price, quantity: 1, addons }];
    });
  };

  const changeQty = (lineKey: string, delta: number) => {
    if (delta > 0) {
      const item = cart.find((cartItem) => itemKey(cartItem) === lineKey);
      const product = item ? menu.find((menuItem) => menuItem.id === item.productId) : undefined;
      const currentQuantity = item ? cartQuantityForProduct(cart, item.productId) : 0;
      if (!canIncreaseProductQuantity(product, currentQuantity)) {
        setCheckoutError(
          product
            ? `Limite de estoque disponivel para ${product.name}: ${product.availableToSell}.`
            : 'Limite de estoque atingido para este produto.',
        );
        return;
      }
      setCheckoutError(null);
    }
    setCart((prev) =>
      prev
        .map((item) =>
          itemKey(item) === lineKey ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const finalize = async () => {
    if (!cart.length) {
      setCheckoutError('Adicione itens ao carrinho para finalizar.');
      return;
    }
    if (!openSession?.id) {
      setCheckoutError('Abra o caixa antes de finalizar pedidos no PDV.');
      return;
    }
    if (!selectedSaleType) {
      setCheckoutError('Escolha o tipo de venda antes de lancar o pedido.');
      return;
    }
    if (isDeferredSale && !commandReference.trim()) {
      setCheckoutError(saleType === 'TABLE' ? 'Informe a mesa para lancar o pedido.' : 'Informe a comanda para lancar o pedido.');
      return;
    }
    setCheckoutError(null);
    setFinishing(true);
    try {
      const payload: PdvCheckoutPayload = {
        storeId,
        saleType: selectedSaleType,
        commandReference: commandReference.trim() || undefined,
        ...(isCounterSale ? { paymentMethod } : {}),
        startInPreparation,
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          selectedOptions: item.addons,
        })),
      };

      const result = await createPdvOrder({
        companyId,
        branchId,
        payload,
      });
      setLastOrder({
        id: result.order.id,
        status: result.order.status,
        saleType: selectedSaleType,
        commandReference: commandReference.trim() || undefined,
        qrCode: result.payment?.qrCode,
        qrCodeText: result.payment?.qrCodeText,
      });
      setCart([]);
      if (isDeferredSale) {
        setCommandReference('');
      }
      if (openSession?.id) {
        const [summary, operator, divergence] = await Promise.all([
          getPdvSessionSummary({
            companyId,
            branchId,
            sessionId: openSession.id,
          }),
          getPdvOperatorSummary({
            companyId,
            branchId,
            sessionId: openSession.id,
          }),
          getPdvSessionDivergence({
            companyId,
            branchId,
            sessionId: openSession.id,
          }),
        ]);
        setSessionSummary(summary);
        setOperatorSummary(operator);
        setSessionDivergence(divergence);
      }
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Falha ao finalizar pedido.');
    } finally {
      setFinishing(false);
    }
  };

  const handleOpenSession = async () => {
    setSessionActionLoading(true);
    setSessionError(null);
    try {
      const opened = await openPdvSession({
        companyId,
        branchId,
        openingBalance: Number(openingBalanceInput || '0'),
      });
      setOpenSession(opened);
      const summary = await getPdvSessionSummary({
        companyId,
        branchId,
        sessionId: opened.id,
      });
      setSessionSummary(summary);
      const movementList = await listPdvMovements({
        companyId,
        branchId,
        sessionId: opened.id,
      });
      setMovements(movementList);
      const [operator, divergence] = await Promise.all([
        getPdvOperatorSummary({
          companyId,
          branchId,
          sessionId: opened.id,
        }),
        getPdvSessionDivergence({
          companyId,
          branchId,
          sessionId: opened.id,
        }),
      ]);
      setOperatorSummary(operator);
      setSessionDivergence(divergence);
      setDeclaredCashInput(String(summary.expectedCashAmount));
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Falha ao abrir caixa.');
    } finally {
      setSessionActionLoading(false);
    }
  };

  const handleCloseSession = async () => {
    if (!openSession?.id) return;
    setSessionActionLoading(true);
    setSessionError(null);
    try {
      await closePdvSession({
        companyId,
        branchId,
        sessionId: openSession.id,
        declaredCashAmount: Number(declaredCashInput || '0'),
        closureNotes: closureNotesInput.trim() || undefined,
      });
      setOpenSession(null);
      setSessionSummary(null);
      setMovements([]);
      setOperatorSummary(null);
      setSessionDivergence(null);
      setClosureNotesInput('');
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Falha ao fechar caixa.');
    } finally {
      setSessionActionLoading(false);
    }
  };

  const handleAddMovement = async () => {
    if (!openSession?.id) return;
    setSessionActionLoading(true);
    setSessionError(null);
    try {
      await createPdvMovement({
        companyId,
        branchId,
        sessionId: openSession.id,
        type: movementType,
        amount: Number(movementAmount || '0'),
        reason: movementReason.trim() || undefined,
      });
      setMovementAmount('');
      setMovementReason('');
      const [summary, movementList] = await Promise.all([
        getPdvSessionSummary({
          companyId,
          branchId,
          sessionId: openSession.id,
        }),
        listPdvMovements({
          companyId,
          branchId,
          sessionId: openSession.id,
        }),
      ]);
      setSessionSummary(summary);
      setMovements(movementList);
      const [operator, divergence] = await Promise.all([
        getPdvOperatorSummary({
          companyId,
          branchId,
          sessionId: openSession.id,
        }),
        getPdvSessionDivergence({
          companyId,
          branchId,
          sessionId: openSession.id,
        }),
      ]);
      setOperatorSummary(operator);
      setSessionDivergence(divergence);
      setDeclaredCashInput(String(summary.expectedCashAmount));
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Falha ao registrar movimentacao.');
    } finally {
      setSessionActionLoading(false);
    }
  };

  finalizeRef.current = finalize;

  const toggleAddon = (groupId: string, optionId: string) => {
    const key = `${groupId}:${optionId}`;
    setSelectedAddons((prev) => (prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]));
  };

  const confirmCustomize = () => {
    if (!customizingProduct) return;
    if (!canIncreaseProductQuantity(customizingProduct, cartQuantityForProduct(cart, customizingProduct.id))) {
      setCheckoutError(
        customizingProduct.stockAvailabilityStatus === 'out_of_stock'
          ? `${customizingProduct.name} esta sem estoque disponivel.`
          : `Limite de estoque disponivel para ${customizingProduct.name}: ${customizingProduct.availableToSell}.`,
      );
      return;
    }
    const selected = (customizingProduct.addonGroups ?? []).flatMap((group) =>
      group.options
        .filter((option) => selectedAddons.includes(`${group.id}:${option.id}`))
        .map((option) => ({
          groupId: group.id,
          optionId: option.id,
          name: option.name,
          price: option.price,
        })),
    );
    addItem(customizingProduct, selected);
    setCustomizingProduct(null);
    setSelectedAddons([]);
  };

  return (
    <main className={styles.page}>
      <PageHeader
        title="PDV / Balcao"
        subtitle="Caixa, venda rapida, KDS e revisao de turno para atendimento presencial"
        right={
          <div className={styles.headerBadges}>
            <Badge tone={openSession ? 'success' : 'danger'}>{openSession ? 'Caixa aberto' : 'Caixa fechado'}</Badge>
            <Badge tone="default">{operatorName}</Badge>
            <Badge tone="warning">{branchId ?? 'Filial local'}</Badge>
          </div>
        }
      />

      <Card className={styles.cashBox}>
        <div className={styles.cashTop}>
          <div>
            <h2 className={styles.sectionTitle}>Caixa</h2>
            <small className={styles.sub}>
              {openSession ? `Aberto desde ${new Date(openSession.openedAt).toLocaleString('pt-BR')}` : 'Caixa fechado'}
            </small>
          </div>
          <Badge tone={openSession ? 'success' : 'danger'}>{openSession ? 'Aberto' : 'Fechado'}</Badge>
        </div>
        {sessionLoading ? <LoadingState label="Carregando status do caixa..." /> : null}
        {sessionError ? <div className={styles.error}>{sessionError}</div> : null}
        <div className={styles.cashActions}>
          {!openSession ? (
            <>
              <Input
                value={openingBalanceInput}
                onChange={(e) => setOpeningBalanceInput(e.target.value)}
                placeholder="Saldo inicial"
              />
              <Button variant="primary" onClick={() => void handleOpenSession()} disabled={sessionActionLoading}>
                {sessionActionLoading ? 'Abrindo...' : 'Abrir Caixa'}
              </Button>
            </>
          ) : (
            <>
              <Input
                value={declaredCashInput}
                onChange={(e) => setDeclaredCashInput(e.target.value)}
                placeholder="Valor declarado no caixa"
              />
              <Input
                value={closureNotesInput}
                onChange={(e) => setClosureNotesInput(e.target.value)}
                placeholder="Justificativa se houver divergencia"
              />
              <Button variant="danger" onClick={() => void handleCloseSession()} disabled={sessionActionLoading}>
                {sessionActionLoading ? 'Fechando...' : 'Fechar Caixa'}
              </Button>
            </>
          )}
        </div>
        {sessionSummary ? (
          <div className={styles.summaryGrid}>
            <div><small>Total vendido</small><strong>{currency(sessionSummary.totalSales)}</strong></div>
            <div><small>Pedidos</small><strong>{sessionSummary.ordersCount}</strong></div>
            <div><small>Ticket medio</small><strong>{currency(sessionSummary.averageTicket)}</strong></div>
            <div><small>Dinheiro</small><strong>{currency(sessionSummary.totalsByMethod.cash)}</strong></div>
            <div><small>PIX</small><strong>{currency(sessionSummary.totalsByMethod.pix)}</strong></div>
            <div><small>Cartao</small><strong>{currency(sessionSummary.totalsByMethod.card)}</strong></div>
            <div><small>Caixa esperado</small><strong>{currency(sessionSummary.expectedCashAmount)}</strong></div>
            {sessionSummary.cashDifference !== undefined ? (
              <div><small>Diferenca</small><strong>{currency(sessionSummary.cashDifference)}</strong></div>
            ) : null}
            <div><small>Suprimentos</small><strong>{currency(sessionSummary.movementTotals.supply)}</strong></div>
            <div><small>Sangrias</small><strong>{currency(sessionSummary.movementTotals.withdrawal)}</strong></div>
            <div><small>Ajustes</small><strong>{currency(sessionSummary.movementTotals.adjustment)}</strong></div>
            <div><small>Movimentos</small><strong>{sessionSummary.movementsCount}</strong></div>
          </div>
        ) : null}
        {openSession ? (
          <div className={styles.movementBox}>
            <h3 className={styles.sectionTitle}>Movimentacoes</h3>
            <div className={styles.movementForm}>
              <Select value={movementType} onChange={(e) => setMovementType(e.target.value as PdvMovementType)}>
                <option value="SUPPLY">Suprimento</option>
                <option value="WITHDRAWAL">Sangria</option>
                <option value="ADJUSTMENT">Ajuste</option>
                <option value="SALE">Venda manual</option>
              </Select>
              <Input
                value={movementAmount}
                onChange={(e) => setMovementAmount(e.target.value)}
                placeholder="Valor"
              />
              <Input
                value={movementReason}
                onChange={(e) => setMovementReason(e.target.value)}
                placeholder="Motivo"
              />
              <Button variant="primary" onClick={() => void handleAddMovement()} disabled={sessionActionLoading}>
                Lancar
              </Button>
            </div>
            <div className={styles.movementList}>
              {movements.map((movement) => (
                <div key={movement.id} className={styles.movementRow}>
                  <strong>{movement.type}</strong>
                  <span>{currency(movement.amount)}</span>
                  <small>{movement.reason ?? '-'}</small>
                  <small>{new Date(movement.createdAt).toLocaleString('pt-BR')}</small>
                </div>
              ))}
              {movements.length === 0 ? <small className={styles.sub}>Sem movimentacoes ainda.</small> : null}
            </div>
          </div>
        ) : null}
      </Card>

      {loading ? <LoadingState label="Carregando produtos..." /> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {!loading && !error ? (
        <section className={styles.grid}>
          <Card className={styles.menu}>
            <div className={styles.menuHeading}>
              <div>
                <h2 className={styles.sectionTitle}>Produtos</h2>
                <small className={styles.sub}>Categorias na lateral e itens compactos para venda rapida.</small>
              </div>
              <Badge tone="default">{filteredMenu.length} itens</Badge>
            </div>
            <div className={styles.filters}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto..."
                data-pdv-product-search="true"
              />
            </div>
            {menu.length === 0 ? <EmptyState title="Sem produtos" description="Nao ha itens disponiveis no menu." /> : null}
            <div className={styles.catalogShell}>
              <aside className={styles.categoryRail} aria-label="Categorias do PDV">
                {categories.map((item) => {
                  const active = category === item;
                  const label = item === 'all' ? 'Todas' : item;
                  return (
                    <button
                      key={item}
                      type="button"
                      className={`${styles.categoryButton} ${active ? styles.categoryButtonActive : ''}`}
                      onClick={() => setCategory(item)}
                    >
                      <span>{label}</span>
                      <strong>{categoryCounts.get(item) ?? 0}</strong>
                    </button>
                  );
                })}
              </aside>
              <div className={styles.products}>
                {filteredMenu.map((product) => {
                  const enabled = isProductEnabledForPdv(product);
                  const currentQuantity = cartQuantityForProduct(cart, product.id);
                  const canAdd = enabled && canIncreaseProductQuantity(product, currentQuantity);
                  const stockHint = isTechnicalStockLimited(product) && typeof product.availableToSell === 'number'
                    ? `${Math.max(product.availableToSell - currentQuantity, 0)} disponiveis`
                    : product.stockStatusMessage;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      className={`${styles.productCard} ${!canAdd ? styles.productCardDisabled : ''} ${product.stockAvailabilityStatus === 'low_stock' ? styles.productCardLowStock : ''}`}
                      disabled={!canAdd}
                      title={canAdd ? 'Adicionar ao carrinho' : product.stockStatusMessage ?? 'Produto indisponivel no PDV'}
                      onClick={() => {
                        if (!canAdd) return;
                        product.addonGroups && product.addonGroups.length > 0
                          ? (setCustomizingProduct(product), setSelectedAddons([]))
                          : addItem(product);
                      }}
                    >
                      <div className={styles.productCardTop}>
                        <strong>{product.name}</strong>
                        <small className={`${styles.statusPill} ${pdvProductStatusClass(product, enabled)}`}>
                          {pdvProductStatusText(product, enabled)}
                        </small>
                      </div>
                      {stockHint ? <small className={styles.stockHint}>{stockHint}</small> : null}
                      <span className={styles.productPrice}>{currency(product.price)}</span>
                    </button>
                  );
                })}
              </div>
              {filteredMenu.length === 0 ? <EmptyState title="Nada encontrado" description="Ajuste a busca ou selecione outra categoria." /> : null}
            </div>
          </Card>

          <Card className={styles.cart}>
            <h2 className={styles.sectionTitle}>Carrinho</h2>
            {cart.length === 0 ? <EmptyState title="Carrinho vazio" description="Selecione itens para montar o pedido." /> : null}
            <div className={styles.cartItems}>
              {cart.map((item) => (
                <div key={itemKey(item)} className={styles.cartItem}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{currency(item.unitPrice)} un</small>
                    {item.addons.length > 0 ? (
                      <small>+ {item.addons.map((addon) => `${addon.name} (${currency(addon.price)})`).join(', ')}</small>
                    ) : null}
                  </div>
                  <div className={styles.qty}>
                    <Button onClick={() => changeQty(itemKey(item), -1)}>-</Button>
                    <span>{item.quantity}</span>
                    <Button onClick={() => changeQty(itemKey(item), 1)}>+</Button>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.payment}>
              <label>Tipo de venda</label>
              <select value={saleType} onChange={(e) => setSaleType(e.target.value as PdvSaleType | '')}>
                <option value="">Escolha o tipo de venda</option>
                <option value="COUNTER">Balcao</option>
                <option value="TABLE">Mesa</option>
                <option value="COMMAND">Comanda</option>
              </select>
              {isDeferredSale ? (
                <Input
                  value={commandReference}
                  onChange={(e) => setCommandReference(e.target.value)}
                  placeholder={saleType === 'TABLE' ? 'Identificador da mesa (ex: M12)' : 'Referencia da comanda'}
                />
              ) : null}
              {isCounterSale ? (
                <>
                  <label>Pagamento</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PdvPaymentMethod)}>
                    <option value="CASH">Dinheiro</option>
                    <option value="PIX">PIX</option>
                    <option value="CREDIT_CARD">Cartao</option>
                  </select>
                </>
              ) : isDeferredSale ? (
                <div className={styles.deferredPaymentNotice}>
                  <strong>{saleTypeLabel} sem pagamento imediato</strong>
                  <small>O pedido sera vinculado e cobrado no fechamento da {saleType === 'TABLE' ? 'mesa' : 'comanda'}.</small>
                </div>
              ) : null}
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={startInPreparation}
                  onChange={(e) => setStartInPreparation(e.target.checked)}
                />
                Enviar direto para preparo
              </label>
            </div>

            <div className={styles.totalRow}>
              <span>Total</span>
              <strong>{currency(subtotal)}</strong>
            </div>
            {checkoutError ? <div className={styles.error}>{checkoutError}</div> : null}
            {lastOrder ? (
              <div className={styles.success}>
                {lastOrder.saleType === 'COUNTER'
                  ? `Pedido ${lastOrder.id} finalizado com status ${lastOrder.status}.`
                  : `Pedido ${lastOrder.id} lancado na ${lastOrder.saleType === 'TABLE' ? 'mesa' : 'comanda'} ${lastOrder.commandReference ?? ''}.`}
                {lastOrder.qrCodeText ? (
                  <div className={styles.pixBox}>
                    <strong>PIX aguardando pagamento</strong>
                    {lastOrder.qrCode ? <img src={lastOrder.qrCode} alt="QR Code PIX" className={styles.qr} /> : null}
                    <div style={{ wordBreak: 'break-all' }}>{lastOrder.qrCodeText}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <Button variant="primary" onClick={() => void finalize()} disabled={finishing || cart.length === 0 || !selectedSaleType}>
              {finishing
                ? 'Processando...'
                : isCounterSale
                  ? 'Finalizar pedido'
                  : isDeferredSale
                    ? `Lancar na ${saleType === 'TABLE' ? 'mesa' : 'comanda'}`
                    : 'Escolha o tipo de venda'}
            </Button>
            <small className={styles.shortcutHint}>Atalhos: F2 busca, F4 finalizar venda, Esc limpar/fechar modal, Enter confirma modal.</small>
          </Card>
        </section>
      ) : null}

      {openSession && (operatorSummary || sessionDivergence) ? (
        <section className={styles.grid}>
          {operatorSummary ? (
            <Card className={styles.cashBox}>
              <h2 className={styles.sectionTitle}>Resumo por operador</h2>
              <div className={styles.summaryGrid}>
                <div><small>Operador</small><strong>{operatorSummary.operator.label}</strong></div>
                <div><small>Pedidos</small><strong>{operatorSummary.ordersCount}</strong></div>
                <div><small>Vendas</small><strong>{currency(operatorSummary.totalSales)}</strong></div>
                <div><small>Ticket medio</small><strong>{currency(operatorSummary.avgTicket)}</strong></div>
                <div><small>Movimentos</small><strong>{operatorSummary.movementsCount}</strong></div>
                <div><small>Suprimentos</small><strong>{currency(operatorSummary.movementTotals.supply)}</strong></div>
                <div><small>Sangrias</small><strong>{currency(operatorSummary.movementTotals.withdrawal)}</strong></div>
                <div><small>Ajustes</small><strong>{currency(operatorSummary.movementTotals.adjustment)}</strong></div>
              </div>
            </Card>
          ) : null}
          {sessionDivergence ? (
            <Card className={styles.cashBox}>
              <h2 className={styles.sectionTitle}>Divergencia de caixa</h2>
              <div className={styles.summaryGrid}>
                <div><small>Nivel</small><strong>{sessionDivergence.divergenceLevel}</strong></div>
                <div><small>Esperado</small><strong>{currency(sessionDivergence.expectedCashAmount)}</strong></div>
                <div><small>Declarado</small><strong>{currency(sessionDivergence.declaredCashAmount ?? 0)}</strong></div>
                <div><small>Diferenca</small><strong>{currency(sessionDivergence.cashDifference ?? 0)}</strong></div>
                <div><small>Diferenca abs.</small><strong>{currency(sessionDivergence.absoluteDifference ?? 0)}</strong></div>
                <div><small>Status</small><strong>{sessionDivergence.status}</strong></div>
                <div><small>Severidade</small><strong>{sessionDivergence.divergenceSeverity}</strong></div>
                {sessionDivergence.closureNotes ? (
                  <div><small>Obs. fechamento</small><strong>{sessionDivergence.closureNotes}</strong></div>
                ) : null}
              </div>
            </Card>
          ) : null}
        </section>
      ) : null}

      {customizingProduct ? (
        <div className={styles.modalBackdrop} onClick={() => setCustomizingProduct(null)}>
          <Card className={styles.modal} onClick={(e: any) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>{customizingProduct.name}</h3>
            <p>{customizingProduct.description}</p>
            {(customizingProduct.addonGroups ?? []).map((group) => (
              <section key={group.id} className={styles.group}>
                <strong>{group.name}</strong>
                {group.options.map((option) => {
                  const key = `${group.id}:${option.id}`;
                  return (
                    <label key={option.id} className={styles.optionRow}>
                      <span>
                        <input
                          type="checkbox"
                          checked={selectedAddons.includes(key)}
                          onChange={() => toggleAddon(group.id, option.id)}
                        />{' '}
                        {option.name}
                      </span>
                      <strong>{currency(option.price)}</strong>
                    </label>
                  );
                })}
              </section>
            ))}
            <div className={styles.modalActions}>
              <Button onClick={() => setCustomizingProduct(null)}>Cancelar</Button>
              <Button variant="primary" onClick={confirmCustomize}>Adicionar</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </main>
  );
}

function itemKey(item: CartItem): string {
  return `${item.productId}-${item.addons.map((a) => `${a.groupId}:${a.optionId}`).sort().join('|')}`;
}
