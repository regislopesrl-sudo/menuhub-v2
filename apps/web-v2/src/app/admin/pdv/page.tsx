'use client';

import { useMemo, useState } from 'react';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useEffect } from 'react';
import {
  closePdvSession,
  createPdvMovement,
  createPdvOrder,
  fetchPdvMenu,
  getCurrentOpenPdvSession,
  getPdvSessionSummary,
  listPdvMovements,
  openPdvSession,
  type PdvMovementType,
  type PdvSessionMovement,
  type PdvPaymentMethod,
  type PdvSessionSummary,
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

export default function AdminPdvPage() {
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const storeId = 'pdv-store';
  const access = useModuleAccess({ companyId, branchId, userRole: 'admin' }, 'pdv');

  const [menu, setMenu] = useState<MenuProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PdvPaymentMethod>('CASH');
  const [startInPreparation, setStartInPreparation] = useState(true);
  const [lastOrder, setLastOrder] = useState<{
    id: string;
    status: string;
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
  const [movements, setMovements] = useState<PdvSessionMovement[]>([]);
  const [movementType, setMovementType] = useState<PdvMovementType>('SUPPLY');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');

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
  const categories = useMemo(
    () => ['all', ...Array.from(new Set(menu.map((item) => item.categoryName).filter(Boolean)))],
    [menu],
  );
  const filteredMenu = useMemo(
    () =>
      menu.filter((product) => {
        const matchesCategory = category === 'all' || product.categoryName === category;
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
          const summary = await getPdvSessionSummary({
            companyId,
            branchId,
            sessionId: current.id,
          });
          setSessionSummary(summary);
          const movementList = await listPdvMovements({
            companyId,
            branchId,
            sessionId: current.id,
          });
          setMovements(movementList);
        } else {
          setOpenSession(null);
          setSessionSummary(null);
          setMovements([]);
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
        const movementList = await listPdvMovements({
          companyId,
          branchId,
          sessionId: openSession.id,
        });
        setMovements(movementList);
      } catch {
        // non-blocking polling
      }
    }, 5000);
    return () => clearInterval(id);
  }, [access.allowed, access.loading, branchId, companyId, openSession?.id]);

  if (access.loading) {
    return <main className={styles.page}><LoadingState label="Validando acesso ao módulo..." /></main>;
  }
  if (!access.allowed) {
    return <ModuleDisabled moduleName="PDV" reason={access.error ?? 'Módulo PDV desativado.'} />;
  }

  const addItem = (
    product: { id: string; name: string; price: number },
    addons: Array<{ groupId: string; optionId: string; name: string; price: number }> = [],
  ) => {
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
    setCheckoutError(null);
    setFinishing(true);
    try {
      const result = await createPdvOrder({
        companyId,
        branchId,
          payload: {
          storeId,
          paymentMethod,
          startInPreparation,
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            selectedOptions: item.addons,
          })),
        },
      });
      setLastOrder({
        id: result.order.id,
        status: result.order.status,
        qrCode: result.payment?.qrCode,
        qrCodeText: result.payment?.qrCodeText,
      });
      setCart([]);
      if (openSession?.id) {
        const summary = await getPdvSessionSummary({
          companyId,
          branchId,
          sessionId: openSession.id,
        });
        setSessionSummary(summary);
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
      });
      setOpenSession(null);
      setSessionSummary(null);
      setMovements([]);
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
      setDeclaredCashInput(String(summary.expectedCashAmount));
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Falha ao registrar movimentacao.');
    } finally {
      setSessionActionLoading(false);
    }
  };

  const toggleAddon = (groupId: string, optionId: string) => {
    const key = `${groupId}:${optionId}`;
    setSelectedAddons((prev) => (prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]));
  };

  const confirmCustomize = () => {
    if (!customizingProduct) return;
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
      <section className={styles.topbar}>
        <div>
          <h1 className={styles.title}>PDV Balcao</h1>
          <p className={styles.sub}>Fluxo rapido de pedido para atendimento presencial</p>
        </div>
        <Badge tone="warning">Canal PDV</Badge>
      </section>

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
              <Button variant="danger" onClick={() => void handleCloseSession()} disabled={sessionActionLoading}>
                {sessionActionLoading ? 'Fechando...' : 'Fechar Caixa'}
              </Button>
            </>
          )}
        </div>
        {sessionSummary ? (
          <div className={styles.summaryGrid}>
            <div><small>Total vendido</small><strong>{currency(sessionSummary.totalSales)}</strong></div>
            <div><small>Pedidos</small><strong>{sessionSummary.totalOrders}</strong></div>
            <div><small>Ticket medio</small><strong>{currency(sessionSummary.avgTicket)}</strong></div>
            <div><small>Dinheiro</small><strong>{currency(sessionSummary.totalsByMethod.cash)}</strong></div>
            <div><small>PIX</small><strong>{currency(sessionSummary.totalsByMethod.pix)}</strong></div>
            <div><small>Cartao</small><strong>{currency(sessionSummary.totalsByMethod.card)}</strong></div>
            <div><small>Caixa esperado</small><strong>{currency(sessionSummary.expectedCashAmount)}</strong></div>
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
            <h2 className={styles.sectionTitle}>Produtos</h2>
            <div className={styles.filters}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto..."
              />
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item === 'all' ? 'Todas categorias' : item}
                  </option>
                ))}
              </Select>
            </div>
            {menu.length === 0 ? <EmptyState title="Sem produtos" description="Nao ha itens disponiveis no menu." /> : null}
            <div className={styles.products}>
              {filteredMenu.map((product) => (
                <button
                  key={product.id}
                  className={styles.productCard}
                  onClick={() =>
                    product.addonGroups && product.addonGroups.length > 0
                      ? (setCustomizingProduct(product), setSelectedAddons([]))
                      : addItem(product)
                  }
                >
                  <strong>{product.name}</strong>
                  <small>{product.description || 'Produto sem descricao'}</small>
                  {product.categoryName ? <small>{product.categoryName}</small> : null}
                  <span>{currency(product.price)}</span>
                </button>
              ))}
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
              <label>Pagamento</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PdvPaymentMethod)}>
                <option value="CASH">Dinheiro</option>
                <option value="PIX">PIX</option>
                <option value="CREDIT_CARD">Cartao</option>
              </select>
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
                Pedido {lastOrder.id} criado com status {lastOrder.status}.
                {lastOrder.qrCodeText ? (
                  <div className={styles.pixBox}>
                    <strong>PIX aguardando pagamento</strong>
                    {lastOrder.qrCode ? <img src={lastOrder.qrCode} alt="QR Code PIX" className={styles.qr} /> : null}
                    <div style={{ wordBreak: 'break-all' }}>{lastOrder.qrCodeText}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <Button variant="primary" onClick={() => void finalize()} disabled={finishing || cart.length === 0}>
              {finishing ? 'Finalizando...' : 'Finalizar pedido'}
            </Button>
            <small className={styles.shortcutHint}>Atalhos (futuro): F2 busca, F4 finalizar, F8 abrir/fechar caixa.</small>
          </Card>
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
