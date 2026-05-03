'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';
import { useCart } from '@/features/cart/use-cart';
import {
  submitDeliveryCheckout,
  type OnlineCardPaymentInput,
} from '@/features/checkout/checkout.api';
import { postCheckoutQuote, type CheckoutQuoteResponse } from '@/features/checkout/checkout-quote.api';
import { fetchPublicOrderTracking, type OrderTrackingResponse } from '@/features/checkout/order-tracking.api';
import { fetchPixPaymentStatus } from '@/features/checkout/payment-status.api';
import { fetchDeliveryMenu, getMenuFallback } from '@/features/menu/menu.api';
import type { MenuProduct } from '@/features/menu/menu.mock';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useModuleAccess } from '@/features/modules/use-module-access';
import { ModuleDisabled } from '@/components/module-disabled';
import { MercadoPagoCardBrick } from '@/features/checkout/components/mercado-pago-card-brick';

function brl(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function addonTotal(product: MenuProduct, selectedOptionKeys: string[]): number {
  return (product.addonGroups ?? [])
    .flatMap((group) => group.options.map((option) => ({ ...option, key: `${group.id}:${option.id}` })))
    .filter((option) => selectedOptionKeys.includes(option.key))
    .reduce((sum, option) => sum + option.price, 0);
}

function validateGroups(product: MenuProduct, selectedOptionKeys: string[]): string[] {
  const errors: string[] = [];
  for (const group of product.addonGroups ?? []) {
    const selectedInGroup = group.options.filter((option) =>
      selectedOptionKeys.includes(`${group.id}:${option.id}`),
    ).length;

    if (group.required && selectedInGroup === 0) {
      errors.push(`Grupo '${group.name}' e obrigatorio.`);
    }
    if (group.minSelect > 0 && selectedInGroup < group.minSelect) {
      errors.push(`Grupo '${group.name}' exige no minimo ${group.minSelect} opcao(oes).`);
    }
    if (group.maxSelect > 0 && selectedInGroup > group.maxSelect) {
      errors.push(`Grupo '${group.name}' permite no maximo ${group.maxSelect} opcao(oes).`);
    }
    if (!group.allowMultiple && selectedInGroup > 1) {
      errors.push(`Grupo '${group.name}' nao permite multiplas escolhas.`);
    }
  }
  return errors;
}

export default function DeliveryPage() {
  const { items, subtotal, addItem, removeItem, updateQuantity, clearCart } = useCart();
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    orderId: string;
    orderNumber?: string;
    trackingToken?: string;
    orderStatus: string;
    total: number;
    paymentStatus: string;
    provider?: string;
    providerPaymentId?: string;
    qrCode?: string;
    qrCodeText?: string;
    expiresAt?: string;
  } | null>(null);
  const [paymentStatusMessage, setPaymentStatusMessage] = useState<string | null>(null);
  const [tracking, setTracking] = useState<OrderTrackingResponse | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [cep, setCep] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [reference, setReference] = useState('');
  const [quote, setQuote] = useState<CheckoutQuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [customizingProduct, setCustomizingProduct] = useState<MenuProduct | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [menuSearch, setMenuSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [cardPayerEmail, setCardPayerEmail] = useState('');
  const [cardInstallments, setCardInstallments] = useState('1');
  const [cardPaymentMethodId, setCardPaymentMethodId] = useState('visa');

  const headers = useMemo(
    () => ({
      companyId: process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo',
      branchId: process.env.NEXT_PUBLIC_MOCK_BRANCH_ID,
    }),
    [],
  );
  const access = useModuleAccess(
    { companyId: headers.companyId, branchId: headers.branchId, userRole: 'user' },
    'delivery',
  );
  const cardMode = (process.env.NEXT_PUBLIC_PAYMENT_CARD_MODE ?? 'mock').trim().toLowerCase() === 'mercadopago'
    ? 'mercadopago'
    : 'mock';
  const mercadoPagoPublicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY ?? '';

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const deliveryFee = quote?.deliveryFee ?? 0;
  const estimatedTotal = quote?.total ?? Math.max(0, subtotal + deliveryFee);
  const etaMinutes = quote?.deliveryQuote.durationSeconds ? Math.ceil(quote.deliveryQuote.durationSeconds / 60) : null;

  const hasAddress = cep.replace(/\D/g, '').length === 8 && !!number.trim();
  const hasCustomer = !!customerName.trim() && !!customerPhone.trim();
  const checkoutStep = !items.length ? 1 : !hasAddress ? 2 : paymentMethod ? 3 : 3;
  const featuredProducts = useMemo(
    () => products.filter((product) => product.featured).sort((a, b) => (a.featuredSortOrder ?? 0) - (b.featuredSortOrder ?? 0)),
    [products],
  );
  const categories = useMemo(
    () => ['all', ...Array.from(new Set(products.map((product) => product.categoryName).filter(Boolean)))],
    [products],
  );
  const visibleProducts = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = activeCategory === 'all' || product.categoryName === activeCategory;
      const matchesSearch =
        !q ||
        product.name.toLowerCase().includes(q) ||
        product.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, menuSearch, products]);
  const recommendedProducts = useMemo(() => {
    const productMap = new Map(products.map((product) => [product.id, product]));
    const cartIds = new Set(items.map((item) => item.productId));
    const configuredIds = items.flatMap((item) => {
      const product = productMap.get(item.productId);
      return product?.recommendations?.active ? product.recommendations.productIds : [];
    });
    const configured = configuredIds
      .map((id) => productMap.get(id))
      .filter((product): product is MenuProduct => Boolean(product && !cartIds.has(product.id)));
    if (configured.length > 0) return configured.slice(0, 4);

    const cartCategories = new Set(
      items.map((item) => productMap.get(item.productId)?.categoryName).filter(Boolean),
    );
    return products
      .filter((product) => !cartIds.has(product.id) && cartCategories.has(product.categoryName))
      .slice(0, 4);
  }, [items, products]);

  useEffect(() => {
    let active = true;
    const loadMenu = async () => {
      if (access.loading || !access.allowed) {
        setMenuLoading(false);
        return;
      }

      setMenuLoading(true);
      setMenuError(null);
      try {
        const realMenu = await fetchDeliveryMenu(headers);
        if (!active) return;
        setProducts(realMenu);
      } catch {
        if (!active) return;
        setProducts(getMenuFallback());
        setMenuError('Cardapio real indisponivel no momento. Exibindo cardapio de contingencia.');
      } finally {
        if (active) setMenuLoading(false);
      }
    };

    void loadMenu();
    return () => {
      active = false;
    };
  }, [access.allowed, access.loading, headers]);

  useEffect(() => {
    let active = true;
    const loadQuote = async () => {
      if (access.loading || !access.allowed || !hasAddress) {
        setQuote(null);
        setQuoteError(null);
        setQuoteLoading(false);
        return;
      }

      setQuoteLoading(true);
      setQuoteError(null);
      try {
        const nextQuote = await postCheckoutQuote({
          companyId: headers.companyId,
          branchId: headers.branchId,
          storeId: 'store-demo',
          items,
          couponCode,
          deliveryAddress: { cep, number },
        });
        if (!active) return;
        setQuote(nextQuote);
      } catch (err) {
        if (!active) return;
        setQuote(null);
        setQuoteError(err instanceof Error ? err.message : 'Falha ao cotar pre-checkout.');
      } finally {
        if (active) setQuoteLoading(false);
      }
    };

    void loadQuote();
    return () => {
      active = false;
    };
  }, [access.allowed, access.loading, hasAddress, headers, cep, number, items, couponCode]);

  useEffect(() => {
    if (access.loading || !access.allowed || !success?.providerPaymentId || success.paymentStatus !== 'PENDING') return;

    let stopped = false;
    const interval = setInterval(async () => {
      try {
        const status = await fetchPixPaymentStatus({ headers, providerPaymentId: success.providerPaymentId! });
        if (stopped) return;

        setSuccess((prev) =>
          prev
            ? {
                ...prev,
                paymentStatus: status.paymentStatus,
                orderStatus: status.orderStatus,
                orderId: status.orderId,
                orderNumber: status.orderNumber,
              }
            : prev,
        );

        if (status.paymentStatus === 'PAID' || status.paymentStatus === 'APPROVED') {
          setPaymentStatusMessage('Pagamento aprovado. Pedido confirmado com sucesso.');
          clearInterval(interval);
        } else if (status.paymentStatus === 'DECLINED') {
          setPaymentStatusMessage('Pagamento recusado. Tente outro metodo de pagamento.');
          clearInterval(interval);
        } else if (status.paymentStatus === 'EXPIRED') {
          setPaymentStatusMessage('Pagamento expirado. Gere um novo pedido para continuar.');
          clearInterval(interval);
        } else {
          setPaymentStatusMessage('Aguardando pagamento PIX...');
        }
      } catch {
        if (!stopped) setPaymentStatusMessage('Aguardando pagamento PIX...');
      }
    }, 5000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [access.allowed, access.loading, headers, success?.providerPaymentId, success?.paymentStatus]);

  useEffect(() => {
    if (access.loading || !access.allowed || !success?.trackingToken) return;

    const trackingToken = success.trackingToken;
    let stopped = false;
    const loadTracking = async () => {
      try {
        const nextTracking = await fetchPublicOrderTracking(trackingToken);
        if (stopped) return;
        setTracking(nextTracking);
        setTrackingError(null);
        setSuccess((prev) =>
          prev
            ? {
                ...prev,
                orderNumber: nextTracking.orderNumber,
                orderStatus: nextTracking.status,
                paymentStatus: nextTracking.paymentStatus,
                total: nextTracking.total,
              }
            : prev,
        );
      } catch (err) {
        if (!stopped) {
          setTrackingError(err instanceof Error ? err.message : 'Nao foi possivel atualizar tracking.');
        }
      }
    };

    void loadTracking();
    const interval = setInterval(() => void loadTracking(), 7000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [access.allowed, access.loading, success?.trackingToken]);

  if (access.loading) {
    return <main className={styles.page}><LoadingState label="Validando acesso ao módulo..." /></main>;
  }
  if (!access.allowed) {
    return <ModuleDisabled moduleName="Delivery" reason={access.error ?? 'Módulo delivery desativado.'} />;
  }

  const validateCheckoutForm = (cardPaymentOverride?: OnlineCardPaymentInput): string | null => {
    if (!customerName.trim()) return 'Informe seu nome para continuar.';
    if (!customerPhone.trim()) return 'Informe seu telefone para contato.';
    if (!hasAddress) return 'Preencha um CEP valido e numero.';
    if (!street.trim()) return 'Informe a rua.';
    if (!neighborhood.trim()) return 'Informe o bairro.';
    if (!items.length) return 'Seu carrinho esta vazio.';
    if (!quote) return 'Nao foi possivel calcular o pre-checkout.';
    if (paymentMethod === 'CREDIT_CARD') {
      const effectiveCardPayment = cardPaymentOverride ?? {
        cardToken: '',
        paymentMethodId: cardPaymentMethodId,
        installments: Math.max(1, Number(cardInstallments || '1') || 1),
        payerEmail: cardPayerEmail,
      };

      if (!effectiveCardPayment.payerEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(effectiveCardPayment.payerEmail.trim())) {
        return 'Informe um email valido para o pagamento com cartao.';
      }
      if (cardMode === 'mercadopago' && !effectiveCardPayment.cardToken.trim()) {
        return 'Use o formulario seguro do Mercado Pago para tokenizar o cartao antes de finalizar.';
      }
    }
    return null;
  };

  const handleCheckout = async (
    cardPaymentOverride?: OnlineCardPaymentInput,
    options?: { rethrow?: boolean },
  ) => {
    setError(null);
    setSuccess(null);
    setTracking(null);
    setTrackingError(null);
    const formError = validateCheckoutForm(cardPaymentOverride);
    if (formError) {
      setError(formError);
      if (options?.rethrow) {
        throw new Error(formError);
      }
      return;
    }

    setLoading(true);
    try {
      const cardPayment: OnlineCardPaymentInput | undefined =
        paymentMethod === 'CREDIT_CARD'
          ? (cardPaymentOverride ?? {
              cardToken: '',
              paymentMethodId: cardPaymentMethodId.trim() || 'visa',
              installments: Math.max(1, Number(cardInstallments || '1') || 1),
              payerEmail: cardPayerEmail.trim(),
            })
          : undefined;

      const response = await submitDeliveryCheckout({
        headers,
        storeId: 'store-demo',
        customer: { name: customerName.trim(), phone: customerPhone.trim() },
        deliveryAddress: {
          cep: cep.trim(),
          street: street.trim(),
          number: number.trim(),
          neighborhood: neighborhood.trim(),
          city: city.trim() || undefined,
          reference: reference.trim() || undefined,
        },
        items,
        couponCode,
        paymentMethod,
        cardPayment,
      });

      setSuccess({
        orderId: response.order.id,
        orderNumber: response.order.orderNumber,
        trackingToken: response.order.trackingToken,
        orderStatus: response.order.status,
        total: response.order.totals.total,
        paymentStatus: response.payment.status,
        provider: response.payment.provider,
        providerPaymentId: response.payment.providerPaymentId,
        qrCode: response.payment.qrCode,
        qrCodeText: response.payment.qrCodeText,
        expiresAt: response.payment.expiresAt,
      });
      setPaymentStatusMessage(response.payment.status === 'PENDING' ? 'Aguardando pagamento PIX...' : null);
      clearCart();
      setCouponCode('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao finalizar pedido.';
      setError(message);
      if (options?.rethrow) {
        throw new Error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMercadoPagoSubmit = async (cardPayment: OnlineCardPaymentInput) => {
    await handleCheckout(cardPayment, { rethrow: true });
  };

  const openCustomize = (product: MenuProduct) => {
    setCustomizingProduct(product);
    setSelectedAddons([]);
  };

  const toggleAddon = (groupId: string, optionId: string) => {
    const key = `${groupId}:${optionId}`;
    setSelectedAddons((prev) => (prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key]));
  };

  const confirmCustomize = () => {
    if (!customizingProduct) return;
    const validationErrors = validateGroups(customizingProduct, selectedAddons);
    if (validationErrors.length > 0) return;

    const selectedAddonData = (customizingProduct.addonGroups ?? []).flatMap((group) =>
      group.options
        .filter((option) => selectedAddons.includes(`${group.id}:${option.id}`))
        .map((option) => ({ groupId: group.id, optionId: option.id, name: option.name, price: option.price })),
    );

    addItem(customizingProduct, selectedAddonData);
    setCustomizingProduct(null);
    setSelectedAddons([]);
  };

  return (
      <main className={styles.page}>
        <PageHeader
          title="MenuHub Delivery"
          subtitle="Cardapio premium, quote em tempo real, PIX e tracking do pedido"
          right={
            <div className={styles.steps}>
              <Badge tone={checkoutStep >= 1 ? 'success' : 'default'}>1. Itens</Badge>
              <Badge tone={checkoutStep >= 2 ? 'success' : 'default'}>2. Endereco</Badge>
              <Badge tone={checkoutStep >= 3 ? 'success' : 'default'}>3. Pagamento</Badge>
              <Badge tone={success ? 'success' : 'default'}>4. Confirmacao</Badge>
            </div>
          }
        />
        <Card className={styles.hero}>
          <div>
            <Badge tone="success">Loja aberta</Badge>
            <h1>Peça seu fast-food favorito sem fila</h1>
            <p>
              Destaques, adicionais, recomendacoes e entrega calculada pelo backend para manter preco e frete confiaveis.
            </p>
          </div>
          <div className={styles.heroMetrics}>
            <span>{products.length} produtos</span>
            <span>{featuredProducts.length} destaques</span>
            <span>{etaMinutes ? `${etaMinutes} min` : 'ETA sob cotacao'}</span>
          </div>
        </Card>
        <div className={styles.layout}>
          <section className={styles.leftCol}>
            {featuredProducts.length > 0 ? (
              <Card className={styles.section}>
                <div className={styles.row}>
                  <h2 className={styles.sectionTitle} style={{ marginBottom: 0 }}>Destaques</h2>
                  <Badge tone="warning">{featuredProducts.length}</Badge>
                </div>
                <div className={styles.productsGrid}>
                  {featuredProducts.map((product) => (
                    <article key={product.id} className={styles.productCard}>
                      <div className={styles.productMedia} aria-hidden />
                      <div className={styles.row}>
                        <strong>{product.name}</strong>
                        <strong>{brl(product.price)}</strong>
                      </div>
                      <div className={styles.muted}>{product.description}</div>
                      <Button variant="primary" onClick={() => openCustomize(product)}>Adicionar destaque</Button>
                    </article>
                  ))}
                </div>
              </Card>
            ) : null}

            <Card className={styles.section}>
              <div className={styles.row}>
                <h2 className={styles.sectionTitle} style={{ marginBottom: 0 }}>Cardápio</h2>
                <Badge tone="default">{visibleProducts.length} itens</Badge>
              </div>
              <div className={styles.menuTools}>
                <Input
                  value={menuSearch}
                  onChange={(event) => setMenuSearch(event.target.value)}
                  placeholder="Buscar burger, combo, bebida..."
                />
                <Select value={activeCategory} onChange={(event) => setActiveCategory(event.target.value)}>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category === 'all' ? 'Todas categorias' : category}
                    </option>
                  ))}
                </Select>
              </div>
              {menuLoading ? <LoadingState label="Carregando cardápio..." /> : null}
              {menuError ? <div className={styles.feedbackError}>{menuError}</div> : null}
              {!menuLoading && products.length === 0 ? (
                <EmptyState title="Nenhum produto disponível" description="Verifique o menu no admin para liberar itens." />
              ) : null}
              <div className={styles.productsGrid}>
                {visibleProducts.map((product) => (
                  <article key={product.id} className={styles.productCard}>
                    <div className={styles.productMedia} aria-hidden />
                    <div className={styles.badgeRow}>
                      {product.featured ? <Badge tone="warning">Destaque</Badge> : null}
                      {product.promotionalPrice ? <Badge tone="success">Promo</Badge> : null}
                      {product.available === false ? <Badge tone="danger">Indisponivel</Badge> : null}
                    </div>
                    <div className={styles.row}>
                      <strong>{product.name}</strong>
                      <strong>{brl(product.price)}</strong>
                    </div>
                    <div className={styles.muted}>{product.description}</div>
                    <Button variant="primary" disabled={product.available === false} onClick={() => openCustomize(product)}>
                      {product.addonGroups && product.addonGroups.length > 0 ? 'Personalizar' : 'Adicionar ao carrinho'}
                    </Button>
                  </article>
                ))}
              </div>
            </Card>

            <Card className={styles.section}>
              <h2 className={styles.sectionTitle}>Endereço e cliente</h2>
              <div className={styles.inline}>
                <div>
                  <label className="ui-label">Nome</label>
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Seu nome" />
                </div>
                <div>
                  <label className="ui-label">Telefone</label>
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(normalizePhone(e.target.value))}
                    placeholder="(11) 99999-0000"
                  />
                </div>
              </div>

              <div className={styles.inline}>
                <div>
                  <label className="ui-label">CEP</label>
                  <Input value={cep} onChange={(e) => setCep(e.target.value)} placeholder="00000-000" />
                </div>
                <div>
                  <label className="ui-label">Número</label>
                  <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="123" />
                </div>
              </div>

              <div className={styles.inline}>
                <div>
                  <label className="ui-label">Rua</label>
                  <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Rua" />
                </div>
                <div>
                  <label className="ui-label">Bairro</label>
                  <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Centro" />
                </div>
              </div>

              <div className={styles.inline}>
                <div>
                  <label className="ui-label">Cidade (opcional)</label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" />
                </div>
                <div>
                  <label className="ui-label">Referência (opcional)</label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ponto de referência" />
                </div>
              </div>
            </Card>
          </section>

          <aside className={styles.rightCol}>
            <Card className={styles.section}>
              <div className={styles.row}>
                <h2 className={styles.sectionTitle} style={{ marginBottom: 0 }}>Seu carrinho</h2>
                <Badge tone="default">{totalItems} itens</Badge>
              </div>

              {items.length === 0 ? <EmptyState title="Carrinho vazio" description="Adicione itens no cardápio para continuar." /> : null}

              {items.map((item, index) => {
                const addonPrice = item.addons.reduce((sum, addon) => sum + addon.price, 0);
                return (
                  <div key={`${item.productId}-${index}`} className={styles.cartItem}>
                    <div className={styles.row}>
                      <strong>{item.name}</strong>
                      <strong>{brl(item.quantity * (item.unitPrice + addonPrice))}</strong>
                    </div>
                    {item.addons.length > 0 ? (
                      <div className={styles.muted}>
                        + {item.addons.map((addon) => `${addon.name} (${brl(addon.price)})`).join(', ')}
                      </div>
                    ) : null}
                    <div className={styles.row}>
                      <small className={styles.muted}>{brl(item.unitPrice + addonPrice)} cada</small>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button onClick={() => updateQuantity(index, item.quantity - 1)}>-</Button>
                        <Badge>{item.quantity}</Badge>
                        <Button onClick={() => updateQuantity(index, item.quantity + 1)}>+</Button>
                        <Button variant="danger" onClick={() => removeItem(index)}>Remover</Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {recommendedProducts.length > 0 ? (
                <div className={styles.recommendations}>
                  <strong>Peca tambem</strong>
                  {recommendedProducts.map((product) => (
                    <div key={product.id} className={styles.recommendationItem}>
                      <span>{product.name}</span>
                      <strong>{brl(product.price)}</strong>
                      <Button onClick={() => addItem(product, [])}>Adicionar</Button>
                    </div>
                  ))}
                </div>
              ) : null}

              <label className="ui-label">Cupom</label>
              <Input
                placeholder="Ex: BEMVINDO10"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
              />

              <label className="ui-label">Pagamento</label>
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="PIX">PIX</option>
                <option value="CREDIT_CARD">
                  Cartao de credito online {cardMode === 'mercadopago' ? '(tokenizado)' : '(simulado)'}
                </option>
                <option value="CASH">Dinheiro na entrega</option>
              </Select>
              {paymentMethod === 'CREDIT_CARD' ? (
                <div className={styles.cardPaymentBox}>
                  <Badge tone={cardMode === 'mercadopago' ? 'success' : 'warning'}>
                    {cardMode === 'mercadopago' ? 'Tokenizado no navegador' : 'Cartao online em modo simulado'}
                  </Badge>
                  <p className={styles.muted}>
                    {cardMode === 'mercadopago'
                      ? 'O backend recebe apenas cardToken, metodo, parcelas e dados do pagador. Numero, validade e CVV ficam dentro do Brick oficial do Mercado Pago.'
                      : 'Modo local/HML: o backend nao recebe dados crus do cartao e usa intent simulada para validar o fluxo.'}
                  </p>
                  {cardMode === 'mock' ? (
                    <>
                      <Input
                        value={cardPayerEmail}
                        onChange={(e) => setCardPayerEmail(e.target.value)}
                        placeholder="Email do pagador"
                        inputMode="email"
                      />
                      <div className={styles.inline}>
                        <Select value={cardPaymentMethodId} onChange={(e) => setCardPaymentMethodId(e.target.value)}>
                          <option value="visa">Visa</option>
                          <option value="master">Mastercard</option>
                          <option value="elo">Elo</option>
                        </Select>
                        <Input
                          value={cardInstallments}
                          onChange={(e) => setCardInstallments(e.target.value.replace(/\D/g, '').slice(0, 2) || '1')}
                          placeholder="Parcelas"
                          inputMode="numeric"
                        />
                      </div>
                    </>
                  ) : (
                    <MercadoPagoCardBrick
                      publicKey={mercadoPagoPublicKey}
                      amount={estimatedTotal}
                      disabled={loading || quoteLoading || !quote?.deliveryQuote.available}
                      onSubmit={handleMercadoPagoSubmit}
                    />
                  )}
                </div>
              ) : null}
              {paymentMethod === 'CASH' ? <div className={styles.muted}>Pagamento em dinheiro sera cobrado na entrega.</div> : null}

              <div className={styles.row}><span>Subtotal</span><strong>{brl(subtotal)}</strong></div>
              <div className={styles.row}><span>Frete {quoteLoading ? '(cotando...)' : ''}</span><strong>{brl(deliveryFee)}</strong></div>
              {quote ? (
                <div className={styles.muted}>
                  Área: {quote.deliveryQuote.areaName ?? '-'} | Distância: {quote.deliveryQuote.distanceKm ?? 0} km | Tempo: {Math.ceil((quote.deliveryQuote.durationSeconds ?? 0) / 60)} min
                </div>
              ) : null}
              <div className={styles.row}><span>Total estimado</span><strong>{brl(estimatedTotal)}</strong></div>

              {quoteError ? <div className={styles.feedbackError}>{quoteError}</div> : null}
              {error ? <div className={styles.feedbackError}>{error}</div> : null}
              {success ? (
                <div className={styles.feedbackSuccess}>
                  Pedido criado com sucesso. ID: {success.orderId} | Total: {brl(success.total)}
                  <div>Pedido: {success.orderStatus}</div>
                  <div>Pagamento: {success.paymentStatus}</div>
                  {paymentStatusMessage ? <div>{paymentStatusMessage}</div> : null}
                  {success.orderNumber ? <div>Número do pedido: {success.orderNumber}</div> : null}
                  {success.provider ? <div>Provider: {success.provider}</div> : null}
                  {success.providerPaymentId ? <div>Provider Payment ID: {success.providerPaymentId}</div> : null}

                  {success.paymentStatus === 'PENDING' && success.qrCodeText ? (
                    <div className={styles.pixBox}>
                      <strong>Aguardando pagamento PIX</strong>
                      <div className={styles.muted}>Expira em: {success.expiresAt ? new Date(success.expiresAt).toLocaleString('pt-BR') : '-'}</div>
                      {success.qrCode ? <img src={success.qrCode} alt="QR Code PIX" className={styles.qrImage} /> : null}
                      <div style={{ wordBreak: 'break-all', marginTop: 8 }}>{success.qrCodeText}</div>
                      <Button type="button" onClick={() => void navigator?.clipboard?.writeText(success.qrCodeText ?? '')}>Copiar codigo PIX</Button>
                    </div>
                  ) : null}

                  <div className={styles.trackingBox}>
                    <strong>Status do pedido</strong>
                    {trackingError ? <div className={styles.feedbackError}>{trackingError}</div> : null}
                    {(tracking?.timeline ?? []).map((event) => (
                      <div key={`${event.status}-${event.createdAt}`} className={styles.trackingStep}>
                        <span />
                        <div>
                          <strong>{event.message}</strong>
                          <small>{new Date(event.createdAt).toLocaleString('pt-BR')}</small>
                        </div>
                      </div>
                    ))}
                    {tracking?.estimatedMinutes ? <div>ETA: {tracking.estimatedMinutes} min</div> : null}
                  </div>
                </div>
              ) : null}

              <Button
                variant="primary"
                disabled={loading || quoteLoading || !quote?.deliveryQuote.available || (paymentMethod === 'CREDIT_CARD' && cardMode === 'mercadopago')}
                onClick={() => void handleCheckout()}
              >
                {loading ? 'Finalizando...' : paymentMethod === 'CREDIT_CARD' && cardMode === 'mercadopago' ? 'Finalize pelo formulario do Mercado Pago' : 'Finalizar pedido'}
              </Button>
            </Card>
          </aside>
        </div>

        {customizingProduct ? (
          <div className={styles.modalBackdrop} onClick={() => setCustomizingProduct(null)}>
            <Card className={styles.modal} onClick={(e: any) => e.stopPropagation()}>
              {(() => {
                const localErrors = validateGroups(customizingProduct, selectedAddons);
                return (
                  <>
                    <h3 style={{ margin: 0 }}>{customizingProduct.name}</h3>
                    <p className={styles.muted}>{customizingProduct.description}</p>

                    {(customizingProduct.addonGroups ?? []).length === 0 ? (
                      <p className={styles.muted}>Sem opcionais para este produto.</p>
                    ) : (
                      (customizingProduct.addonGroups ?? []).map((group) => (
                        <section key={group.id} className={styles.productCard}>
                          <strong>{group.name}</strong>
                          <span className={styles.muted}>
                            {group.required ? 'Obrigatório' : 'Opcional'} | Min {group.minSelect} | Max {group.maxSelect} | {group.allowMultiple ? 'Múltiplas opções permitidas' : 'Apenas uma opção'}
                          </span>
                          {group.options.map((option) => {
                            const checked = selectedAddons.includes(`${group.id}:${option.id}`);
                            return (
                              <label key={option.id} className={styles.optionRow}>
                                <span>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleAddon(group.id, option.id)}
                                  />{' '}
                                  {option.name}
                                </span>
                                <strong>{brl(option.price)}</strong>
                              </label>
                            );
                          })}
                        </section>
                      ))
                    )}

                    {localErrors.length > 0 ? (
                      <div className={styles.feedbackError}>
                        {localErrors.map((errorText) => (
                          <div key={errorText}>{errorText}</div>
                        ))}
                      </div>
                    ) : null}

                    <div className={styles.row}>
                      <strong>Total unitário: {brl(customizingProduct.price + addonTotal(customizingProduct, selectedAddons))}</strong>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button onClick={() => setCustomizingProduct(null)}>Cancelar</Button>
                        <Button variant="primary" onClick={confirmCustomize} disabled={localErrors.length > 0}>
                          Adicionar ao carrinho
                        </Button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </Card>
          </div>
        ) : null}
      </main>
  );
}



