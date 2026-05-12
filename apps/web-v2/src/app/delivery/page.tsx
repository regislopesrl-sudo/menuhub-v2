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
import { fetchDeliveryMenu, fetchDeliveryStorefront, getMenuFallback, type DeliveryStorefrontSettings } from '@/features/menu/menu.api';
import type { MenuProduct } from '@/features/menu/menu.mock';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { MercadoPagoCardBrick } from '@/features/checkout/components/mercado-pago-card-brick';

function brl(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function productDisplayPrice(product: MenuProduct): number {
  return Number(product.promotionalPrice ?? product.deliveryPrice ?? product.price ?? 0);
}

function productInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
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
  const [storefront, setStorefront] = useState<DeliveryStorefrontSettings | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [fulfillmentType, setFulfillmentType] = useState<'DELIVERY' | 'TAKEOUT'>('DELIVERY');
  const [scheduledAt, setScheduledAt] = useState('');
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
  const [customizingQuantity, setCustomizingQuantity] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [cardPayerEmail, setCardPayerEmail] = useState('');
  const [cardInstallments, setCardInstallments] = useState('1');
  const [cardPaymentMethodId, setCardPaymentMethodId] = useState('visa');

  const headers = useMemo(
    () => ({
      companyId: process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo',
      branchId: process.env.NEXT_PUBLIC_MOCK_BRANCH_ID,
      companySlug: process.env.NEXT_PUBLIC_PUBLIC_COMPANY_SLUG ?? process.env.NEXT_PUBLIC_MOCK_COMPANY_SLUG ?? 'company-demo',
    }),
    [],
  );
  const cardMode = (process.env.NEXT_PUBLIC_PAYMENT_CARD_MODE ?? 'mock').trim().toLowerCase() === 'mercadopago'
    ? 'mercadopago'
    : 'mock';
  const mercadoPagoPublicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY ?? '';
  const storefrontName = storefront?.publicTitle || process.env.NEXT_PUBLIC_STOREFRONT_NAME || 'MenuHub Demo';
  const storefrontLogoUrl = storefront?.logoUrl || process.env.NEXT_PUBLIC_STOREFRONT_LOGO_URL || '';
  const storefrontBannerUrl = storefront?.bannerUrl || process.env.NEXT_PUBLIC_STOREFRONT_BANNER_URL || '';

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const deliveryFee = quote?.deliveryFee ?? 0;
  const estimatedTotal = quote?.total ?? Math.max(0, subtotal + deliveryFee);
  const hasAddress = fulfillmentType === 'TAKEOUT' || (cep.replace(/\D/g, '').length === 8 && !!number.trim());
  const hasCustomer = !!customerName.trim() && !!customerPhone.trim();
  const featuredProducts = useMemo(
    () => products.filter((product) => product.featured).sort((a, b) => (a.featuredSortOrder ?? 0) - (b.featuredSortOrder ?? 0)),
    [products],
  );
  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.categoryName).filter((category): category is string => Boolean(category)))).sort((a, b) => String(a).localeCompare(String(b))),
    [products],
  );
  const currentCategory = activeCategory || categories[0] || '';
  const visibleProducts = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = !currentCategory || product.categoryName === currentCategory;
      const matchesSearch =
        !q ||
        product.name.toLowerCase().includes(q) ||
        product.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [currentCategory, menuSearch, products]);

  useEffect(() => {
    if (categories.length === 0) {
      if (activeCategory) setActiveCategory('');
      return;
    }
    if (!categories.includes(activeCategory)) {
      setActiveCategory(categories[0] ?? '');
    }
  }, [activeCategory, categories]);
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

      setMenuLoading(true);
      setMenuError(null);
      try {
        const [realMenu, storefrontSettings] = await Promise.all([
          fetchDeliveryMenu(headers),
          fetchDeliveryStorefront(headers).catch(() => null),
        ]);
        if (!active) return;
        setProducts(realMenu);
        setStorefront(storefrontSettings);
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
  }, [headers]);

  useEffect(() => {
    let active = true;
    const loadQuote = async () => {
      if (!hasAddress || fulfillmentType === 'TAKEOUT') {
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
  }, [hasAddress, fulfillmentType, headers, cep, number, items, couponCode]);

  useEffect(() => {
    if (!success?.providerPaymentId || success.paymentStatus !== 'PENDING') return;

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
  }, [headers, success?.providerPaymentId, success?.paymentStatus]);

  useEffect(() => {
    if (!success?.trackingToken) return;

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
  }, [success?.trackingToken]);

  const checkoutIssues = useMemo(() => {
    if (success) return [];
    const issues: string[] = [];
    if (!items.length) issues.push('Adicione pelo menos um item ao carrinho.');
    if (!customerName.trim()) issues.push('Informe seu nome.');
    if (!customerPhone.trim()) issues.push('Informe seu telefone.');
    if (fulfillmentType === 'DELIVERY') {
      if (!hasAddress) issues.push('Informe CEP valido e numero.');
      if (!street.trim()) issues.push('Informe a rua.');
      if (!neighborhood.trim()) issues.push('Informe o bairro.');
      if (!quote && hasAddress) issues.push('Aguarde ou refaca a cotacao de entrega.');
      if (quote && !quote.deliveryQuote.available) issues.push(quote.deliveryQuote.message ?? 'Endereco fora da area de entrega.');
    }
    if (scheduledAt.trim() && Number.isNaN(new Date(scheduledAt).getTime())) {
      issues.push('Data/hora de agendamento invalida.');
    }
    if (paymentMethod === 'CREDIT_CARD' && cardMode === 'mock' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cardPayerEmail.trim())) {
      issues.push('Informe um email valido para cartao.');
    }
    return issues;
  }, [
    cardMode,
    cardPayerEmail,
    customerName,
    customerPhone,
    fulfillmentType,
    hasAddress,
    items.length,
    neighborhood,
    paymentMethod,
    quote,
    scheduledAt,
    street,
    success,
  ]);

  const checkoutStep = success ? 4 : items.length === 0 ? 1 : checkoutIssues.length > 0 ? 2 : 3;
  const checkoutBlocked = checkoutIssues.length > 0 || quoteLoading;
  const checkoutSteps = ['1. Itens', '2. Dados', '3. Pagamento', '4. Confirmacao'];

  const validateCheckoutForm = (cardPaymentOverride?: OnlineCardPaymentInput): string | null => {
    if (!customerName.trim()) return 'Informe seu nome para continuar.';
    if (!customerPhone.trim()) return 'Informe seu telefone para contato.';
    if (fulfillmentType === 'DELIVERY') {
      if (!hasAddress) return 'Preencha um CEP valido e numero.';
      if (!street.trim()) return 'Informe a rua.';
      if (!neighborhood.trim()) return 'Informe o bairro.';
    }
    if (!items.length) return 'Seu carrinho esta vazio.';
    if (fulfillmentType === 'DELIVERY' && !quote) return 'Nao foi possivel calcular o pre-checkout.';
    if (scheduledAt.trim() && Number.isNaN(new Date(scheduledAt).getTime())) return 'Data/hora de agendamento invalida.';
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
        fulfillmentType,
        scheduledAt: scheduledAt.trim() || undefined,
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
    setCustomizingQuantity(1);
  };

  const toggleAddon = (group: NonNullable<MenuProduct['addonGroups']>[number], optionId: string) => {
    const key = `${group.id}:${optionId}`;
    setSelectedAddons((prev) => {
      if (prev.includes(key)) return prev.filter((id) => id !== key);
      const withoutGroup = group.allowMultiple ? prev : prev.filter((id) => !id.startsWith(`${group.id}:`));
      return [...withoutGroup, key];
    });
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

    addItem({ ...customizingProduct, price: productDisplayPrice(customizingProduct) }, selectedAddonData, customizingQuantity);
    setCartOpen(true);
    setCustomizingProduct(null);
    setSelectedAddons([]);
    setCustomizingQuantity(1);
  };

  return (
      <main className={styles.page}>
        <button type="button" className={styles.cartFloatingButton} onClick={() => setCartOpen(true)}>
          <span>Meu Carrinho</span>
          <strong>{totalItems}</strong>
        </button>

        <section
          className={styles.storefrontHero}
          style={
            storefrontBannerUrl
              ? { backgroundImage: 'linear-gradient(115deg, rgba(15, 23, 42, 0.18), rgba(15, 23, 42, 0.04)), url(' + storefrontBannerUrl + ')' }
              : undefined
          }
        >
          <div className={styles.storeIdentity}>
            <div className={styles.storeLogo}>
              {storefrontLogoUrl ? <img src={storefrontLogoUrl} alt={'Logo ' + storefrontName} /> : <span>{storefrontName.slice(0, 2).toUpperCase()}</span>}
            </div>
            <div className={styles.storeNameBox}>
              <small>Cardapio online</small>
              <strong>{storefrontName}</strong>
            </div>
          </div>
        </section>
        <div className={styles.layout}>
          <section className={styles.leftCol}>
            {featuredProducts.length > 0 ? (
              <Card className={styles.section}>
                <div className={styles.row}>
                  <h2 className={`${styles.sectionTitle} ${styles.sectionTitleCompact}`}>Destaques</h2>
                  <Badge tone="warning">{featuredProducts.length}</Badge>
                </div>
                <div className={styles.productsGrid}>
                  {featuredProducts.map((product) => (
                    <article
                      key={product.id}
                      className={styles.productCard}
                      role="button"
                      tabIndex={0}
                      onClick={() => openCustomize(product)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') openCustomize(product);
                      }}
                    >
                      <div className={styles.productMedia} aria-hidden>
                        {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span>{productInitials(product.name)}</span>}
                      </div>
                      <div className={styles.row}>
                        <strong>{product.name}</strong>
                        <strong>{brl(productDisplayPrice(product))}</strong>
                      </div>
                      <div className={styles.muted}>{product.description}</div>
                      <Button variant="primary" onClick={(event) => { event.stopPropagation(); openCustomize(product); }}>Ver produto</Button>
                    </article>
                  ))}
                </div>
              </Card>
            ) : null}

            <Card className={styles.section}>
              <div className={styles.row}>
                <h2 className={`${styles.sectionTitle} ${styles.sectionTitleCompact}`}>Cardápio</h2>
                <Badge tone="default">{visibleProducts.length} itens</Badge>
              </div>
              <div className={styles.menuTools}>
                <Input
                  value={menuSearch}
                  onChange={(event) => setMenuSearch(event.target.value)}
                  placeholder="Buscar burger, combo, bebida..."
                />
                <div className={styles.categoryScroller} aria-label="Categorias do cardapio">
                  {categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      className={category === currentCategory ? styles.categoryPillActive : styles.categoryPill}
                      onClick={() => setActiveCategory(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
              {menuLoading ? <LoadingState label="Carregando cardápio..." /> : null}
              {menuError ? <div className={styles.feedbackError}>{menuError}</div> : null}
              {!menuLoading && products.length === 0 ? (
                <EmptyState title="Nenhum produto disponível" description="Verifique o menu no admin para liberar itens." />
              ) : null}
              <div className={styles.productsGrid}>
                {visibleProducts.map((product) => (
                  <article
                    key={product.id}
                    className={styles.productCard}
                    role="button"
                    tabIndex={0}
                    onClick={() => openCustomize(product)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') openCustomize(product);
                    }}
                  >
                    <div className={styles.productMedia} aria-hidden>
                      {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span>{productInitials(product.name)}</span>}
                    </div>
                    <div className={styles.badgeRow}>
                      {product.featured ? <Badge tone="warning">Destaque</Badge> : null}
                      {product.promotionalPrice ? <Badge tone="success">Promo</Badge> : null}
                      {product.available === false ? <Badge tone="danger">Indisponivel</Badge> : null}
                    </div>
                    <div className={styles.row}>
                      <strong>{product.name}</strong>
                      <strong>{brl(productDisplayPrice(product))}</strong>
                    </div>
                    <div className={styles.muted}>{product.description}</div>
                    <Button
                      variant="primary"
                      disabled={product.available === false}
                      onClick={(event) => {
                        event.stopPropagation();
                        openCustomize(product);
                      }}
                    >
                      Ver produto
                    </Button>
                  </article>
                ))}
              </div>
            </Card>

            <Card className={styles.section}>
              <h2 className={styles.sectionTitle}>Endereço e cliente</h2>
              <div className={styles.fulfillmentCards} aria-label="Tipo de atendimento">
                <button
                  type="button"
                  className={fulfillmentType === 'DELIVERY' ? styles.fulfillmentCardActive : styles.fulfillmentCard}
                  onClick={() => setFulfillmentType('DELIVERY')}
                >
                  <strong>Receber em casa</strong>
                  <span>Calcule frete e acompanhe o pedido.</span>
                </button>
                <button
                  type="button"
                  className={fulfillmentType === 'TAKEOUT' ? styles.fulfillmentCardActive : styles.fulfillmentCard}
                  onClick={() => setFulfillmentType('TAKEOUT')}
                >
                  <strong>Retirar no balcão</strong>
                  <span>Sem frete e com retirada mais rápida.</span>
                </button>
              </div>
              <div className={styles.inline}>
                <div>
                  <label className="ui-label">Tipo de atendimento</label>
                  <Select value={fulfillmentType} onChange={(e) => setFulfillmentType(e.target.value as 'DELIVERY' | 'TAKEOUT')}>
                    <option value="DELIVERY">Entrega</option>
                    <option value="TAKEOUT">Retirada</option>
                  </Select>
                </div>
                <div>
                  <label className="ui-label">Agendamento (opcional)</label>
                  <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                </div>
              </div>
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

              {fulfillmentType === 'DELIVERY' ? (
                <>
                  <div className={styles.addressHint}>
                    <strong>{hasAddress ? 'CEP e numero informados' : 'Informe CEP e numero para cotar'}</strong>
                    <span>{quoteLoading ? 'Calculando frete...' : quote ? `Frete ${brl(deliveryFee)}${quote.deliveryQuote.areaName ? ` - ${quote.deliveryQuote.areaName}` : ''}` : 'A cotacao e feita automaticamente.'}</span>
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
                </>
              ) : (
                <div className={styles.takeoutBox}>
                  <strong>Retirada selecionada</strong>
                  <span>Voce nao precisa informar endereco. Avise seu nome e telefone para identificarmos o pedido no balcao.</span>
                </div>
              )}
              {scheduledAt ? (
                <div className={styles.scheduleBox}>
                  <strong>Pedido agendado</strong>
                  <span>{Number.isNaN(new Date(scheduledAt).getTime()) ? 'Data invalida' : new Date(scheduledAt).toLocaleString('pt-BR')}</span>
                </div>
              ) : null}
              <div className={styles.checkoutReadiness}>
                <div>
                  <strong>{checkoutIssues.length === 0 ? 'Tudo pronto para finalizar' : 'Faltam alguns dados'}</strong>
                  <span>
                    {fulfillmentType === 'TAKEOUT'
                      ? 'Retirada no balcao, sem frete.'
                      : quote
                        ? `Entrega ${quote.deliveryQuote.available ? 'disponivel' : 'indisponivel'}${quote.deliveryQuote.areaName ? ` em ${quote.deliveryQuote.areaName}` : ''}.`
                        : 'A cotacao aparece automaticamente depois do CEP e numero.'}
                  </span>
                </div>
                <Badge tone={checkoutIssues.length === 0 ? 'success' : 'warning'}>
                  {checkoutIssues.length === 0 ? 'Pronto' : `${checkoutIssues.length} pendencia(s)`}
                </Badge>
              </div>
            </Card>
          </section>


        </div>

        {cartOpen ? (
          <div className={styles.modalBackdrop} onClick={() => setCartOpen(false)}>
            <Card className={styles.cartModal} onClick={(e: any) => e.stopPropagation()}>
              <div className={styles.cartModalHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Meu Carrinho</h2>
                  <p className={styles.muted}>{totalItems} item(ns) selecionado(s)</p>
                </div>
                <Button onClick={() => setCartOpen(false)}>Fechar</Button>
              </div>
              <div className={styles.checkoutSteps} aria-label="Etapas do checkout">
                {checkoutSteps.map((step, index) => (
                  <span key={step} className={index + 1 <= checkoutStep ? styles.checkoutStepActive : styles.checkoutStep}>
                    {step}
                  </span>
                ))}
              </div>
            <Card className={styles.cartPanel}>
              <div className={styles.row}>
                <h2 className={`${styles.sectionTitle} ${styles.sectionTitleCompact}`}>Seu carrinho</h2>
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
                      <div className={styles.quantityActions}>
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
                      <strong>{brl(productDisplayPrice(product))}</strong>
                      <Button onClick={() => addItem({ ...product, price: productDisplayPrice(product) }, [])}>Adicionar</Button>
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
                      disabled={loading || quoteLoading || (fulfillmentType === 'DELIVERY' && !quote?.deliveryQuote.available)}
                      onSubmit={handleMercadoPagoSubmit}
                    />
                  )}
                </div>
              ) : null}
              {paymentMethod === 'CASH' ? <div className={styles.muted}>Pagamento em dinheiro sera cobrado na entrega.</div> : null}

              <div className={styles.row}><span>Subtotal</span><strong>{brl(subtotal)}</strong></div>
              <div className={styles.row}>
                <span>{fulfillmentType === 'TAKEOUT' ? 'Retirada' : `Frete ${quoteLoading ? '(cotando...)' : ''}`}</span>
                <strong>{fulfillmentType === 'TAKEOUT' ? 'Sem frete' : brl(deliveryFee)}</strong>
              </div>
              {fulfillmentType === 'DELIVERY' && quote ? (
                <div className={styles.muted}>
                  Área: {quote.deliveryQuote.areaName ?? '-'} | Distância: {quote.deliveryQuote.distanceKm ?? 0} km | Tempo: {Math.ceil((quote.deliveryQuote.durationSeconds ?? 0) / 60)} min
                </div>
              ) : null}
              <div className={styles.row}><span>Total estimado</span><strong>{brl(estimatedTotal)}</strong></div>

              {quoteError ? <div className={styles.feedbackError}>{quoteError}</div> : null}
              {checkoutIssues.length > 0 ? (
                <div className={styles.checkoutIssues}>
                  <strong>Antes de finalizar</strong>
                  {checkoutIssues.map((issue) => (
                    <span key={issue}>{issue}</span>
                  ))}
                </div>
              ) : null}
              {error ? <div className={styles.feedbackError}>{error}</div> : null}
              {success ? (
                <div className={styles.confirmationCard}>
                  <div className={styles.confirmationHeader}>
                    <div>
                      <span>Pedido recebido</span>
                      <strong>{success.orderNumber ?? success.orderId}</strong>
                    </div>
                    <Badge tone={success.paymentStatus === 'PAID' || success.paymentStatus === 'APPROVED' ? 'success' : 'warning'}>
                      {success.paymentStatus}
                    </Badge>
                  </div>
                  <div className={styles.confirmationGrid}>
                    <div>
                      <small>Total</small>
                      <strong>{brl(success.total)}</strong>
                    </div>
                    <div>
                      <small>Status do pedido</small>
                      <strong>{tracking?.status ?? success.orderStatus}</strong>
                    </div>
                    <div>
                      <small>Pagamento</small>
                      <strong>{success.provider ?? paymentMethod}</strong>
                    </div>
                    <div>
                      <small>Estimativa</small>
                      <strong>{tracking?.estimatedMinutes ? `${tracking.estimatedMinutes} min` : 'Atualizando'}</strong>
                    </div>
                  </div>
                  {paymentStatusMessage ? <div className={styles.confirmationNotice}>{paymentStatusMessage}</div> : null}
                  {success.trackingToken ? (
                    <div className={styles.trackingTokenBox}>
                      <span>Token de acompanhamento</span>
                      <strong>{success.trackingToken}</strong>
                      <Button type="button" onClick={() => void navigator?.clipboard?.writeText(success.trackingToken ?? '')}>Copiar</Button>
                    </div>
                  ) : null}

                  {success.paymentStatus === 'PENDING' && success.qrCodeText ? (
                    <div className={styles.pixBox}>
                      <strong>Aguardando pagamento PIX</strong>
                      <div className={styles.muted}>Expira em: {success.expiresAt ? new Date(success.expiresAt).toLocaleString('pt-BR') : '-'}</div>
                      {success.qrCode ? <img src={success.qrCode} alt="QR Code PIX" className={styles.qrImage} /> : null}
                      <div className={styles.breakText}>{success.qrCodeText}</div>
                      <Button type="button" onClick={() => void navigator?.clipboard?.writeText(success.qrCodeText ?? '')}>Copiar codigo PIX</Button>
                    </div>
                  ) : null}

                  <div className={styles.trackingBox}>
                    <div className={styles.row}>
                      <strong>Acompanhamento em tempo real</strong>
                      <Badge tone="success">Atualiza automaticamente</Badge>
                    </div>
                    {trackingError ? <div className={styles.feedbackError}>{trackingError}</div> : null}
                    {(tracking?.timeline ?? []).length > 0 ? (
                      (tracking?.timeline ?? []).map((event) => (
                        <div key={`${event.status}-${event.createdAt}`} className={styles.trackingStep}>
                          <span />
                          <div>
                            <strong>{event.message}</strong>
                            <small>{new Date(event.createdAt).toLocaleString('pt-BR')}</small>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className={styles.muted}>Buscando os primeiros eventos do pedido...</div>
                    )}
                  </div>
                </div>
              ) : null}

              {!success ? (
                <Button
                  variant="primary"
                  disabled={loading || checkoutBlocked || (paymentMethod === 'CREDIT_CARD' && cardMode === 'mercadopago')}
                  onClick={() => void handleCheckout()}
                >
                  {loading ? 'Finalizando...' : paymentMethod === 'CREDIT_CARD' && cardMode === 'mercadopago' ? 'Finalize pelo formulario do Mercado Pago' : 'Finalizar pedido'}
                </Button>
              ) : null}
            </Card>
            </Card>
          </div>
        ) : null}

        {customizingProduct ? (
          <div className={styles.modalBackdrop} onClick={() => setCustomizingProduct(null)}>
            <Card className={styles.modal} onClick={(e: any) => e.stopPropagation()}>
              {(() => {
                const localErrors = validateGroups(customizingProduct, selectedAddons);
                const basePrice = productDisplayPrice(customizingProduct);
                return (
                  <>
                    <div className={styles.productDetailHero}>
                      <div className={styles.productDetailMedia}>
                        {customizingProduct.imageUrl ? (
                          <img src={customizingProduct.imageUrl} alt={customizingProduct.name} />
                        ) : (
                          <span>{productInitials(customizingProduct.name)}</span>
                        )}
                      </div>
                      <div className={styles.productDetailSummary}>
                        <div className={styles.badgeRow}>
                          {customizingProduct.categoryName ? <Badge tone="default">{customizingProduct.categoryName}</Badge> : null}
                          {customizingProduct.prepTimeMinutes ? <Badge tone="warning">{customizingProduct.prepTimeMinutes} min</Badge> : null}
                          {(customizingProduct.addonGroups ?? []).length > 0 ? <Badge tone="success">Com opcionais</Badge> : null}
                        </div>
                        <h3 className={styles.modalTitle}>{customizingProduct.name}</h3>
                        <p className={styles.muted}>{customizingProduct.description || 'Monte seu item e adicione ao carrinho.'}</p>
                      </div>
                    </div>
                    <div className={styles.productDetailPrice}>
                      <strong>{brl(basePrice)}</strong>
                      {customizingProduct.promotionalPrice ? <Badge tone="success">Preco promocional</Badge> : null}
                      {customizingProduct.deliveryPrice && customizingProduct.deliveryPrice !== customizingProduct.price ? <Badge tone="default">Preco delivery</Badge> : null}
                    </div>

                    <div className={styles.quantitySelector}>
                      <span>Quantidade</span>
                      <div className={styles.quantityActions}>
                        <Button onClick={() => setCustomizingQuantity((value) => Math.max(1, value - 1))}>-</Button>
                        <Badge>{customizingQuantity}</Badge>
                        <Button onClick={() => setCustomizingQuantity((value) => value + 1)}>+</Button>
                      </div>
                    </div>

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
                                    onChange={() => toggleAddon(group, option.id)}
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
                      <strong>Total: {brl(customizingQuantity * (basePrice + addonTotal(customizingProduct, selectedAddons)))}</strong>
                      <div className={styles.modalActions}>
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




