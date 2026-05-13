'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './page.module.css';
import { useCart } from '@/features/cart/use-cart';
import {
  submitDeliveryCheckout,
  type OnlineCardPaymentInput,
} from '@/features/checkout/checkout.api';
import { lookupDeliveryCep, postCheckoutQuote, type CheckoutQuoteResponse } from '@/features/checkout/checkout-quote.api';
import { fetchPublicOrderTracking, type OrderTrackingResponse } from '@/features/checkout/order-tracking.api';
import { fetchPixPaymentStatus } from '@/features/checkout/payment-status.api';
import { fetchDeliveryMenu, fetchDeliveryStorefront, getMenuFallback, type DeliveryStorefrontSettings } from '@/features/menu/menu.api';
import { getSmartMenuRecommendations } from '@/features/menu/menu-recommendations';
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

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
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

function parseStorefrontMedia(value: string): Array<{ type: 'image' | 'video'; src: string }> {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((src) => ({
      src,
      type: src.startsWith('data:video') || /\.(mp4|webm|ogg)(\?|#|$)/i.test(src) ? 'video' as const : 'image' as const,
    }));
}

const WEEKDAY_TO_DAY_KEY: Record<string, string> = {
  Sun: 'sunday',
  Mon: 'monday',
  Tue: 'tuesday',
  Wed: 'wednesday',
  Thu: 'thursday',
  Fri: 'friday',
  Sat: 'saturday',
};

function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(':').map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function formatStoreTime(value?: string | null): string {
  if (!value) return '';
  const [hour = '00', minute = '00'] = value.split(':');
  return `${hour.padStart(2, '0')}h${minute.padStart(2, '0')}`;
}

function getZonedNow(timezone?: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return {
    dayKey: WEEKDAY_TO_DAY_KEY[weekday] ?? 'sunday',
    minutes: (hour % 24) * 60 + minute,
  };
}

function getStoreStatus(storefront: DeliveryStorefrontSettings | null) {
  const timezone = storefront?.timezone || 'America/Sao_Paulo';
  const zonedNow = getZonedNow(timezone);
  const today = storefront?.schedules?.find((entry) => entry.dayKey === zonedNow.dayKey);
  const branchIsOpen = storefront?.isOpen !== false;

  if (!branchIsOpen) {
    return {
      isOpen: false,
      headline: 'Loja fechada',
      schedule: storefront?.closedMessage || 'Fechado no momento',
    };
  }

  if (!today) {
    return {
      isOpen: true,
      headline: 'Loja aberta',
      schedule: 'Horário não informado',
    };
  }

  if (!today.isOpen) {
    return {
      isOpen: false,
      headline: 'Loja fechada',
      schedule: 'Fechado hoje',
    };
  }

  const openMinutes = timeToMinutes(today.openAt);
  const closeMinutes = timeToMinutes(today.closeAt);
  const todayWindow = `${today.label}, ${formatStoreTime(today.openAt)} às ${formatStoreTime(today.closeAt)}`;
  if (openMinutes === null || closeMinutes === null) {
    return {
      isOpen: true,
      headline: 'Loja aberta',
      schedule: todayWindow,
    };
  }

  const insideWindow = closeMinutes > openMinutes
    ? zonedNow.minutes >= openMinutes && zonedNow.minutes < closeMinutes
    : zonedNow.minutes >= openMinutes || zonedNow.minutes < closeMinutes;

  if (insideWindow) {
    return {
      isOpen: true,
      headline: `Aberto até às ${formatStoreTime(today.closeAt)}`,
      schedule: todayWindow,
    };
  }

  if (zonedNow.minutes < openMinutes) {
    return {
      isOpen: false,
      headline: `Abre às ${formatStoreTime(today.openAt)}`,
      schedule: todayWindow,
    };
  }

  return {
    isOpen: false,
    headline: 'Loja fechada',
    schedule: todayWindow,
  };
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

type CheckoutView = 'cart' | 'phone' | 'register' | 'fulfillment' | 'address' | 'payment' | 'confirmation';

type StoredDeliveryCustomer = {
  name: string;
  phone: string;
  birthDate: string;
  whatsappOptIn: boolean;
};

const CUSTOMER_STORAGE_KEY = 'menuhub:delivery-customers';

function phoneDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11);
}

function readStoredCustomers(): Record<string, StoredDeliveryCustomer> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CUSTOMER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, StoredDeliveryCustomer>) : {};
  } catch {
    return {};
  }
}

function saveStoredCustomer(customer: StoredDeliveryCustomer): void {
  if (typeof window === 'undefined') return;
  const customers = readStoredCustomers();
  customers[phoneDigits(customer.phone)] = customer;
  window.localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(customers));
}

export default function DeliveryPage() {
  const { items, subtotal, addItem, replaceItem, removeItem, updateQuantity, clearCart } = useCart();
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
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [cepLookupMessage, setCepLookupMessage] = useState<string | null>(null);
  const lastCepLookupRef = useRef('');

  const [customizingProduct, setCustomizingProduct] = useState<MenuProduct | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [customizingQuantity, setCustomizingQuantity] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);
  const [editingCartIndex, setEditingCartIndex] = useState<number | null>(null);
  const [checkoutView, setCheckoutView] = useState<CheckoutView>('cart');
  const [phoneLookup, setPhoneLookup] = useState('');
  const [customerBirthDate, setCustomerBirthDate] = useState('');
  const [customerWhatsappOptIn, setCustomerWhatsappOptIn] = useState(true);
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
  const storefrontMedia = parseStorefrontMedia(storefrontBannerUrl);
  const storeStatus = getStoreStatus(storefront);
  const locationLabel = [storefront?.city, storefront?.state].filter(Boolean).join(' - ') || 'Localização não informada';
  const deliveryDetails = [
    storefront?.delivery?.averagePrepMinutes ? `Preparo ${storefront.delivery.averagePrepMinutes} min` : null,
    storefront?.delivery?.averageDeliveryMinutes ? `Entrega ${storefront.delivery.averageDeliveryMinutes} min` : null,
    storefront?.delivery?.minimumOrder ? `Mínimo ${brl(storefront.delivery.minimumOrder)}` : null,
  ].filter((detail): detail is string => Boolean(detail));

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const deliveryFee = quote?.deliveryFee ?? 0;
  const estimatedTotal = quote?.total ?? Math.max(0, subtotal + deliveryFee);
  const hasAddress = fulfillmentType === 'TAKEOUT' || (cep.replace(/\D/g, '').length === 8 && !!number.trim());
  const hasCustomer = !!customerName.trim() && !!customerPhone.trim();
  const featuredProducts = useMemo(
    () => products.filter((product) => product.featured).sort((a, b) => (a.featuredSortOrder ?? 0) - (b.featuredSortOrder ?? 0)),
    [products],
  );
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
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
    if (items.length === 0) return [];
    return getSmartMenuRecommendations(products, { cartItems: items, limit: 4 });
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
    const digits = cep.replace(/\D/g, '');

    if (digits.length !== 8) {
      lastCepLookupRef.current = '';
      setCepLookupLoading(false);
      setCepLookupMessage(null);
      return;
    }

    if (lastCepLookupRef.current === digits) {
      return;
    }

    let active = true;
    const timeout = window.setTimeout(async () => {
      setCepLookupLoading(true);
      setCepLookupMessage(null);
      try {
        const address = await lookupDeliveryCep(digits);
        if (!active) return;
        lastCepLookupRef.current = digits;
        setCep(formatCep(address.cep));
        setStreet(address.street);
        setNeighborhood(address.district);
        setCity([address.city, address.state].filter(Boolean).join(' - '));
        setCepLookupMessage('Endereco preenchido automaticamente pelo CEP.');
      } catch (err) {
        if (!active) return;
        lastCepLookupRef.current = digits;
        setCepLookupMessage(err instanceof Error ? err.message : 'Nao foi possivel buscar o CEP.');
      } finally {
        if (active) setCepLookupLoading(false);
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [cep]);

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

  const checkoutStep = success || checkoutView === 'confirmation'
    ? 4
    : checkoutView === 'payment'
      ? 4
      : checkoutView === 'fulfillment' || checkoutView === 'address'
        ? 3
        : checkoutView === 'phone' || checkoutView === 'register'
          ? 2
          : 1;
  const checkoutBlocked = checkoutIssues.length > 0 || quoteLoading;
  const checkoutSteps = ['1. Sacola', '2. Cliente', '3. Entrega', '4. Pagamento'];

  const handleCepChange = (value: string) => {
    const formatted = formatCep(value);
    const digits = formatted.replace(/\D/g, '');
    setCep(formatted);
    if (digits.length < 8) {
      setCepLookupMessage(null);
    }
  };

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
        customer: {
          name: customerName.trim(),
          phone: customerPhone.trim(),
          birthDate: customerBirthDate.trim() || undefined,
          whatsappOptIn: customerWhatsappOptIn,
        },
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
      setCheckoutView('confirmation');
      setCartOpen(true);
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

  const startCheckout = () => {
    if (!items.length) {
      setError('Sua sacola está vazia.');
      return;
    }
    setError(null);
    setPhoneLookup(customerPhone || phoneLookup);
    setCheckoutView('phone');
  };

  const confirmPhone = () => {
    const digits = phoneDigits(phoneLookup);
    if (digits.length < 10) {
      setError('Informe um telefone válido para continuar.');
      return;
    }

    const formattedPhone = normalizePhone(digits);
    setCustomerPhone(formattedPhone);
    const storedCustomer = readStoredCustomers()[digits];
    if (storedCustomer) {
      setCustomerName(storedCustomer.name);
      setCustomerPhone(storedCustomer.phone);
      setCustomerBirthDate(storedCustomer.birthDate);
      setCustomerWhatsappOptIn(storedCustomer.whatsappOptIn);
      setError(null);
      setCheckoutView('fulfillment');
      return;
    }

    setCustomerName('');
    setCustomerBirthDate('');
    setCustomerWhatsappOptIn(true);
    setError(null);
    setCheckoutView('register');
  };

  const saveCustomerRegistration = () => {
    if (!customerName.trim()) {
      setError('Informe seu nome para continuar.');
      return;
    }
    if (phoneDigits(customerPhone).length < 10) {
      setError('Informe um telefone válido.');
      return;
    }
    saveStoredCustomer({
      name: customerName.trim(),
      phone: customerPhone,
      birthDate: customerBirthDate,
      whatsappOptIn: customerWhatsappOptIn,
    });
    setError(null);
    setCheckoutView('fulfillment');
  };

  const openCustomize = (product: MenuProduct) => {
    setEditingCartIndex(null);
    setCustomizingProduct(product);
    setSelectedAddons([]);
    setCustomizingQuantity(1);
  };

  const openEditCartItem = (index: number) => {
    const item = items[index];
    const product = item ? productById.get(item.productId) : null;
    if (!item || !product) return;
    setEditingCartIndex(index);
    setCustomizingProduct(product);
    setSelectedAddons(item.addons.map((addon) => `${addon.groupId}:${addon.optionId}`));
    setCustomizingQuantity(item.quantity);
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

    const cartProduct = { ...customizingProduct, price: productDisplayPrice(customizingProduct) };
    if (editingCartIndex !== null) {
      replaceItem(editingCartIndex, cartProduct, selectedAddonData, customizingQuantity);
    } else {
      addItem(cartProduct, selectedAddonData, customizingQuantity);
    }
    setCartOpen(true);
    setCustomizingProduct(null);
    setEditingCartIndex(null);
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
        >
          <div className={styles.storefrontMediaTrack} aria-hidden>
            {storefrontMedia.length > 0 ? (
              storefrontMedia.map((media, index) => (
                <div
                  key={`${media.src}-${index}`}
                  className={styles.storefrontMediaSlide}
                  style={{
                    animationDelay: storefrontMedia.length > 1 ? `${index * 5}s` : '0s',
                    animationDuration: storefrontMedia.length > 1 ? `${storefrontMedia.length * 5}s` : '0s',
                  }}
                >
                  {media.type === 'video' ? (
                    <video src={media.src} autoPlay muted loop playsInline />
                  ) : (
                    <img src={media.src} alt="" />
                  )}
                </div>
              ))
            ) : null}
          </div>
          <div className={styles.storeHeroFooter}>
            <div className={styles.storeLogo}>
              {storefrontLogoUrl ? <img src={storefrontLogoUrl} alt={'Logo ' + storefrontName} /> : <span>{storefrontName.slice(0, 2).toUpperCase()}</span>}
            </div>
            <div className={styles.storeNameBox}>
              <small>Cardápio online</small>
              <strong>{storefrontName}</strong>
              <div className={styles.storeMetaRow}>
                <span className={storeStatus.isOpen ? styles.storeOpenStatus : styles.storeClosedStatus}>{storeStatus.headline}</span>
                <span>{storeStatus.schedule}</span>
                <span>{locationLabel}</span>
                <span>Mais informações</span>
              </div>
              {deliveryDetails.length > 0 ? (
                <div className={styles.storeDetailRow}>
                  {deliveryDetails.map((detail) => <span key={detail}>{detail}</span>)}
                </div>
              ) : null}
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

            <Card className={`${styles.section} ${styles.menuSection}`}>
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
              </div>
              {menuLoading ? <LoadingState label="Carregando cardápio..." /> : null}
              {menuError ? <div className={styles.feedbackError}>{menuError}</div> : null}
              {!menuLoading && products.length === 0 ? (
                <EmptyState title="Nenhum produto disponível" description="Verifique o menu no admin para liberar itens." />
              ) : null}
              <div className={styles.menuCatalogLayout}>
                <aside className={styles.categoryRail} aria-label="Categorias do cardapio">
                  {categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      className={category === currentCategory ? styles.categoryPillActive : styles.categoryPill}
                      onClick={() => setActiveCategory(category)}
                    >
                      <span>{category}</span>
                      <strong>{products.filter((product) => product.categoryName === category).length}</strong>
                    </button>
                  ))}
                </aside>
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
                  <p className={styles.muted}>
                    {totalItems === 1 ? '1 item selecionado' : `${totalItems} itens selecionados`}
                  </p>
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
              {checkoutView === 'cart' ? (
                <>
                  <button
                    type="button"
                    className={styles.deliveryCta}
                    onClick={() => setCheckoutView('fulfillment')}
                  >
                    <span className={styles.deliveryIcon}>?</span>
                    <span className={styles.deliveryCtaText}>
                      <strong>Calcular taxa e tempo de entrega</strong>
                      <small>
                        {fulfillmentType === 'TAKEOUT'
                          ? 'Retirada no balcão selecionada, sem taxa de entrega.'
                          : quote
                            ? `${brl(deliveryFee)}${quote.deliveryQuote.durationSeconds ? ` - ${Math.ceil((quote.deliveryQuote.durationSeconds ?? 0) / 60)} min` : ''}`
                            : 'Informe CEP e número para calcular antes de finalizar.'}
                      </small>
                    </span>
                    <span className={styles.deliveryArrow}>&gt;</span>
                  </button>

                  <section className={styles.bagSection}>
                    <div className={styles.bagHeader}>
                      <h3>Sua sacola</h3>
                      {items.length > 0 ? <button type="button" onClick={clearCart}>Limpar</button> : null}
                    </div>
                    {items.length === 0 ? <EmptyState title="Sacola vazia" description="Adicione itens no cardápio para continuar." /> : null}
                    <div className={styles.bagList}>
                      {items.map((item, index) => {
                        const addonPrice = item.addons.reduce((sum, addon) => sum + addon.price, 0);
                        const product = productById.get(item.productId);
                        return (
                          <div key={`${item.productId}-${index}`} className={styles.cartItem}>
                            <div className={styles.cartItemMain}>
                              <div className={styles.cartItemText}>
                                <div className={styles.cartItemTitleRow}>
                                  <strong>{item.quantity}x {item.name}</strong>
                                  <strong>{brl(item.quantity * (item.unitPrice + addonPrice))}</strong>
                                </div>
                                {item.addons.length > 0 ? <div className={styles.muted}>+ {item.addons.map((addon) => `${addon.name} (${brl(addon.price)})`).join(', ')}</div> : null}
                                <span className={styles.cartAvailability}>Apenas para delivery e retirada</span>
                              </div>
                              <div className={styles.cartThumb}>
                                {product?.imageUrl ? <img src={product.imageUrl} alt="" /> : <span>{productInitials(item.name)}</span>}
                              </div>
                            </div>
                            <div className={styles.cartItemActions}>
                              <button type="button" onClick={() => openEditCartItem(index)}>Editar</button>
                              <button type="button" onClick={() => removeItem(index)}>Remover</button>
                              <div className={styles.quantityActions}>
                                <Button onClick={() => updateQuantity(index, item.quantity - 1)}>-</Button>
                                <Badge>{item.quantity}</Badge>
                                <Button onClick={() => updateQuantity(index, item.quantity + 1)}>+</Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {recommendedProducts.length > 0 ? (
                    <section className={styles.recommendations}>
                      <div>
                        <strong>Peça também</strong>
                        <span>Sugestões inteligentes baseadas nos itens da sua sacola.</span>
                      </div>
                      <div className={styles.recommendationScroller}>
                        {recommendedProducts.map((product) => (
                          <button key={product.id} type="button" className={styles.recommendationItem} onClick={() => openCustomize(product)}>
                            <div className={styles.recommendationImage}>
                              {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span>{productInitials(product.name)}</span>}
                            </div>
                            <span className={styles.recommendationName}>{product.name}</span>
                            <strong className={styles.recommendationPrice}>{brl(productDisplayPrice(product))}</strong>
                          </button>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <section className={styles.cartTotals}>
                    <div className={styles.row}><span>Subtotal</span><strong>{brl(subtotal)}</strong></div>
                    <div className={styles.row}>
                      <span>Taxa de entrega</span>
                      <strong>{fulfillmentType === 'TAKEOUT' ? 'Sem taxa' : quote ? brl(deliveryFee) : 'A definir'}</strong>
                    </div>
                    {fulfillmentType === 'DELIVERY' && quote ? <div className={styles.muted}>Área: {quote.deliveryQuote.areaName ?? '-'} | Distância: {quote.deliveryQuote.distanceKm ?? 0} km | Tempo: {Math.ceil((quote.deliveryQuote.durationSeconds ?? 0) / 60)} min</div> : null}
                    <div className={`${styles.row} ${styles.totalRow}`}><span>Total</span><strong>{brl(estimatedTotal)}</strong></div>
                  </section>

                  <section className={styles.couponSection}>
                    <button type="button" className={styles.couponCta} onClick={() => setCouponOpen((value) => !value)} aria-expanded={couponOpen}>
                      <span className={styles.couponIcon}>%</span>
                      <span>
                        <strong>Tem um cupom?</strong>
                        <small>{couponCode ? couponCode : 'Clique e insira o código'}</small>
                      </span>
                      <span className={styles.deliveryArrow}>&gt;</span>
                    </button>
                    {couponOpen ? <Input placeholder="Ex: BEMVINDO10" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} /> : null}
                  </section>

                  {error ? <div className={styles.feedbackError}>{error}</div> : null}
                  <Button variant="primary" className={styles.continueButton} disabled={!items.length} onClick={startCheckout}>
                    Continuar pedido
                  </Button>
                </>
              ) : null}

              {checkoutView === 'phone' ? (
                <section className={styles.checkoutScreen}>
                  <button type="button" className={styles.modalCloseButton} onClick={() => setCheckoutView('cart')}>x</button>
                  <h3>Informe seu número de telefone</h3>
                  <p>Ele é importante para falarmos com você caso necessário.</p>
                  <label className="ui-label">Telefone</label>
                  <Input value={phoneLookup} onChange={(e) => setPhoneLookup(normalizePhone(e.target.value))} placeholder="(00) 90000-0000" inputMode="tel" autoFocus />
                  {error ? <div className={styles.feedbackError}>{error}</div> : null}
                  <Button variant="primary" className={styles.continueButton} onClick={confirmPhone}>Confirmar</Button>
                </section>
              ) : null}

              {checkoutView === 'register' ? (
                <section className={styles.checkoutScreen}>
                  <button type="button" className={styles.modalCloseButton} onClick={() => setCheckoutView('phone')}>x</button>
                  <h3>Complete seu cadastro</h3>
                  <p>Não encontramos esse telefone. Cadastre seus dados para continuar o pedido.</p>
                  <div className={styles.inline}>
                    <div>
                      <label className="ui-label">Nome</label>
                      <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Seu nome" />
                    </div>
                    <div>
                      <label className="ui-label">Telefone</label>
                      <Input value={customerPhone} onChange={(e) => setCustomerPhone(normalizePhone(e.target.value))} placeholder="(11) 99999-0000" inputMode="tel" />
                    </div>
                  </div>
                  <div className={styles.inline}>
                    <div>
                      <label className="ui-label">Data de nascimento</label>
                      <Input type="date" value={customerBirthDate} onChange={(e) => setCustomerBirthDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="ui-label">Aceita receber WhatsApp?</label>
                      <Select value={customerWhatsappOptIn ? 'yes' : 'no'} onChange={(e) => setCustomerWhatsappOptIn(e.target.value === 'yes')}>
                        <option value="yes">Sim</option>
                        <option value="no">Não</option>
                      </Select>
                    </div>
                  </div>
                  {error ? <div className={styles.feedbackError}>{error}</div> : null}
                  <Button variant="primary" className={styles.continueButton} onClick={saveCustomerRegistration}>Salvar cadastro</Button>
                </section>
              ) : null}

              {checkoutView === 'fulfillment' ? (
                <section className={styles.checkoutScreen}>
                  <button type="button" className={styles.modalCloseButton} onClick={() => setCheckoutView('cart')}>x</button>
                  <h3>Checkout</h3>
                  <p>Escolha como quer receber seu pedido.</p>
                  <div className={styles.checkoutOptionList}>
                    <button type="button" className={fulfillmentType === 'DELIVERY' ? styles.checkoutOptionActive : styles.checkoutOption} onClick={() => setFulfillmentType('DELIVERY')}>
                      <span>Receber no seu endereço</span>
                      <strong>{fulfillmentType === 'DELIVERY' ? 'Selecionado' : 'Selecionar'}</strong>
                    </button>
                    {fulfillmentType === 'DELIVERY' ? (
                      <button type="button" className={styles.checkoutOption} onClick={() => setCheckoutView('address')}>
                        <span>{hasAddress ? 'Endereço informado. Clique para alterar.' : 'Clique aqui e informe o endereço'}</span>
                        <strong>&gt;</strong>
                      </button>
                    ) : null}
                    <button type="button" className={fulfillmentType === 'TAKEOUT' ? styles.checkoutOptionActive : styles.checkoutOption} onClick={() => setFulfillmentType('TAKEOUT')}>
                      <span>Retirar no estabelecimento</span>
                      <strong>{fulfillmentType === 'TAKEOUT' ? 'Selecionado' : 'Selecionar'}</strong>
                    </button>
                  </div>
                  {quoteError ? <div className={styles.feedbackError}>{quoteError}</div> : null}
                  <Button variant="primary" className={styles.continueButton} onClick={() => (fulfillmentType === 'DELIVERY' && !hasAddress ? setCheckoutView('address') : setCheckoutView('payment'))}>
                    Continuar
                  </Button>
                </section>
              ) : null}

              {checkoutView === 'address' ? (
                <section className={styles.checkoutScreen}>
                  <button type="button" className={styles.modalCloseButton} onClick={() => setCheckoutView('fulfillment')}>x</button>
                  <h3>Endereço de entrega</h3>
                  <p>Informe o endereço para calcular a taxa e o tempo de entrega.</p>
                  <div className={styles.inline}>
                    <div><label className="ui-label">CEP</label><Input value={cep} onChange={(e) => handleCepChange(e.target.value)} placeholder="00000-000" /></div>
                    <div><label className="ui-label">Número</label><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="123" /></div>
                  </div>
                  <div className={styles.inline}>
                    <div><label className="ui-label">Rua</label><Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Rua" /></div>
                    <div><label className="ui-label">Bairro</label><Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Centro" /></div>
                  </div>
                  <div className={styles.inline}>
                    <div><label className="ui-label">Cidade (opcional)</label><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" /></div>
                    <div><label className="ui-label">Referência (opcional)</label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ponto de referência" /></div>
                  </div>
                  <div className={styles.addressHint}>
                    <strong>{quoteLoading ? 'Calculando frete...' : quote ? `Frete ${brl(deliveryFee)}` : 'Preencha CEP e número'}</strong>
                    {cepLookupLoading ? <span>Buscando endereco pelo CEP...</span> : null}
                    {cepLookupMessage ? <span>{cepLookupMessage}</span> : null}
                    <span>{quote ? `Tempo estimado: ${Math.ceil((quote.deliveryQuote.durationSeconds ?? 0) / 60)} min` : 'A cotação será feita automaticamente.'}</span>
                  </div>
                  {quoteError ? <div className={styles.feedbackError}>{quoteError}</div> : null}
                  <Button variant="primary" className={styles.continueButton} onClick={() => setCheckoutView('fulfillment')} disabled={!hasAddress}>Salvar endereço</Button>
                </section>
              ) : null}

              {checkoutView === 'payment' ? (
                <section className={styles.checkoutScreen}>
                  <button type="button" className={styles.modalCloseButton} onClick={() => setCheckoutView('fulfillment')}>x</button>
                  <h3>Pagamento</h3>
                  <p>Revise seus dados e escolha a forma de pagamento.</p>
                  <div className={styles.paymentSummaryBox}>
                    <span>Cliente: <strong>{customerName}</strong></span>
                    <span>Telefone: <strong>{customerPhone}</strong></span>
                    <span>Entrega: <strong>{fulfillmentType === 'TAKEOUT' ? 'Retirada' : quote ? `${brl(deliveryFee)} - ${Math.ceil((quote.deliveryQuote.durationSeconds ?? 0) / 60)} min` : 'A definir'}</strong></span>
                    <span>Total: <strong>{brl(estimatedTotal)}</strong></span>
                  </div>
                  <label className="ui-label">Pagamento</label>
                  <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option value="PIX">PIX</option>
                    <option value="CREDIT_CARD">Cartão de crédito online {cardMode === 'mercadopago' ? '(tokenizado)' : '(simulado)'}</option>
                    <option value="CASH">Dinheiro na entrega</option>
                  </Select>
                  {paymentMethod === 'CREDIT_CARD' ? (
                    <div className={styles.cardPaymentBox}>
                      <Badge tone={cardMode === 'mercadopago' ? 'success' : 'warning'}>{cardMode === 'mercadopago' ? 'Tokenizado no navegador' : 'Cartão online em modo simulado'}</Badge>
                      {cardMode === 'mock' ? (
                        <>
                          <Input value={cardPayerEmail} onChange={(e) => setCardPayerEmail(e.target.value)} placeholder="Email do pagador" inputMode="email" />
                          <div className={styles.inline}>
                            <Select value={cardPaymentMethodId} onChange={(e) => setCardPaymentMethodId(e.target.value)}>
                              <option value="visa">Visa</option>
                              <option value="master">Mastercard</option>
                              <option value="elo">Elo</option>
                            </Select>
                            <Input value={cardInstallments} onChange={(e) => setCardInstallments(e.target.value.replace(/\D/g, '').slice(0, 2) || '1')} placeholder="Parcelas" inputMode="numeric" />
                          </div>
                        </>
                      ) : (
                        <MercadoPagoCardBrick publicKey={mercadoPagoPublicKey} amount={estimatedTotal} disabled={loading || quoteLoading || (fulfillmentType === 'DELIVERY' && !quote?.deliveryQuote.available)} onSubmit={handleMercadoPagoSubmit} />
                      )}
                    </div>
                  ) : null}
                  {checkoutIssues.length > 0 ? <div className={styles.checkoutIssues}><strong>Antes de finalizar</strong>{checkoutIssues.map((issue) => <span key={issue}>{issue}</span>)}</div> : null}
                  {error ? <div className={styles.feedbackError}>{error}</div> : null}
                  <Button variant="primary" className={styles.continueButton} disabled={loading || checkoutBlocked || (paymentMethod === 'CREDIT_CARD' && cardMode === 'mercadopago')} onClick={() => void handleCheckout()}>
                    {loading ? 'Finalizando...' : paymentMethod === 'CREDIT_CARD' && cardMode === 'mercadopago' ? 'Finalize pelo formulário do Mercado Pago' : 'Finalizar pedido'}
                  </Button>
                </section>
              ) : null}

              {checkoutView === 'confirmation' && success ? (
                <div className={styles.confirmationCard}>
                  <div className={styles.confirmationHeader}>
                    <div><span>Pedido recebido</span><strong>{success.orderNumber ?? success.orderId}</strong></div>
                    <Badge tone={success.paymentStatus === 'PAID' || success.paymentStatus === 'APPROVED' ? 'success' : 'warning'}>{success.paymentStatus}</Badge>
                  </div>
                  <div className={styles.confirmationGrid}>
                    <div><small>Total</small><strong>{brl(success.total)}</strong></div>
                    <div><small>Status do pedido</small><strong>{tracking?.status ?? success.orderStatus}</strong></div>
                    <div><small>Pagamento</small><strong>{success.provider ?? paymentMethod}</strong></div>
                    <div><small>Estimativa</small><strong>{tracking?.estimatedMinutes ? `${tracking.estimatedMinutes} min` : 'Atualizando'}</strong></div>
                  </div>
                  {paymentStatusMessage ? <div className={styles.confirmationNotice}>{paymentStatusMessage}</div> : null}
                  {success.trackingToken ? <div className={styles.trackingTokenBox}><span>Token de acompanhamento</span><strong>{success.trackingToken}</strong><Button type="button" onClick={() => void navigator?.clipboard?.writeText(success.trackingToken ?? '')}>Copiar</Button></div> : null}
                  {success.paymentStatus === 'PENDING' && success.qrCodeText ? (
                    <div className={styles.pixBox}>
                      <strong>Aguardando pagamento PIX</strong>
                      <div className={styles.muted}>Expira em: {success.expiresAt ? new Date(success.expiresAt).toLocaleString('pt-BR') : '-'}</div>
                      {success.qrCode ? <img src={success.qrCode} alt="QR Code PIX" className={styles.qrImage} /> : null}
                      <div className={styles.breakText}>{success.qrCodeText}</div>
                      <Button type="button" onClick={() => void navigator?.clipboard?.writeText(success.qrCodeText ?? '')}>Copiar código PIX</Button>
                    </div>
                  ) : null}
                </div>
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
