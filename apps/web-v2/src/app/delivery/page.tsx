'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';
import { useCart } from '@/features/cart/use-cart';
import { submitDeliveryCheckout } from '@/features/checkout/checkout.api';
import { postCheckoutQuote, type CheckoutQuoteResponse } from '@/features/checkout/checkout-quote.api';
import { fetchPixPaymentStatus } from '@/features/checkout/payment-status.api';
import { fetchDeliveryMenu, getMenuFallback } from '@/features/menu/menu.api';
import type { MenuProduct } from '@/features/menu/menu.mock';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { useModuleAccess } from '@/features/modules/use-module-access';
import { ModuleDisabled } from '@/components/module-disabled';

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

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const deliveryFee = quote?.deliveryFee ?? 0;
  const estimatedTotal = quote?.total ?? Math.max(0, subtotal + deliveryFee);

  const hasAddress = cep.replace(/\D/g, '').length === 8 && !!number.trim();
  const hasCustomer = !!customerName.trim() && !!customerPhone.trim();
  const checkoutStep = !items.length ? 1 : !hasAddress ? 2 : paymentMethod ? 3 : 3;

  if (access.loading) {
    return <main className={styles.page}><LoadingState label="Validando acesso ao módulo..." /></main>;
  }
  if (!access.allowed) {
    return <ModuleDisabled moduleName="Delivery" reason={access.error ?? 'Módulo delivery desativado.'} />;
  }

  useEffect(() => {
    let active = true;
    const loadMenu = async () => {
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
  }, [headers]);

  useEffect(() => {
    let active = true;
    const loadQuote = async () => {
      if (!hasAddress) {
        setQuote(null);
        setQuoteError(null);
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
  }, [hasAddress, headers, cep, number, items, couponCode]);

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

  const validateCheckoutForm = (): string | null => {
    if (!customerName.trim()) return 'Informe seu nome para continuar.';
    if (!customerPhone.trim()) return 'Informe seu telefone para contato.';
    if (!hasAddress) return 'Preencha um CEP valido e numero.';
    if (!street.trim()) return 'Informe a rua.';
    if (!neighborhood.trim()) return 'Informe o bairro.';
    if (!items.length) return 'Seu carrinho esta vazio.';
    if (!quote) return 'Nao foi possivel calcular o pre-checkout.';
    return null;
  };

  const handleCheckout = async () => {
    setError(null);
    setSuccess(null);
    const formError = validateCheckoutForm();
    if (formError) {
      setError(formError);
      return;
    }

    setLoading(true);
    try {
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
      });

      setSuccess({
        orderId: response.order.id,
        orderNumber: response.order.orderNumber,
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
      setError(err instanceof Error ? err.message : 'Erro ao finalizar pedido.');
    } finally {
      setLoading(false);
    }
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
    <>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div>
            <h1 className={styles.title}>MenuHub Delivery</h1>
            <small className={styles.muted}>Checkout inteligente com quote e pagamento PIX</small>
          </div>
          <div className={styles.steps}>
            <Badge tone={checkoutStep >= 1 ? 'success' : 'default'}>1. Itens</Badge>
            <Badge tone={checkoutStep >= 2 ? 'success' : 'default'}>2. Endereço</Badge>
            <Badge tone={checkoutStep >= 3 ? 'success' : 'default'}>3. Pagamento</Badge>
            <Badge tone={success ? 'success' : 'default'}>4. Confirmação</Badge>
          </div>
        </div>
      </header>

      <main className={styles.page}>
        <div className={styles.layout}>
          <section className={styles.leftCol}>
            <Card className={styles.section}>
              <h2 className={styles.sectionTitle}>Cardápio</h2>
              {menuLoading ? <LoadingState label="Carregando cardápio..." /> : null}
              {menuError ? <div className={styles.feedbackError}>{menuError}</div> : null}
              {!menuLoading && products.length === 0 ? (
                <EmptyState title="Nenhum produto disponível" description="Verifique o menu no admin para liberar itens." />
              ) : null}
              <div className={styles.productsGrid}>
                {products.map((product) => (
                  <article key={product.id} className={styles.productCard}>
                    <div className={styles.productMedia} aria-hidden />
                    <div className={styles.row}>
                      <strong>{product.name}</strong>
                      <strong>{brl(product.price)}</strong>
                    </div>
                    <div className={styles.muted}>{product.description}</div>
                    <Button variant="primary" onClick={() => openCustomize(product)}>
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

              <label className="ui-label">Cupom</label>
              <Input
                placeholder="Ex: BEMVINDO10"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
              />

              <label className="ui-label">Pagamento</label>
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="PIX">PIX</option>
                <option value="CREDIT_CARD">Cartão de crédito</option>
                <option value="CASH">Dinheiro</option>
              </Select>

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
                      <Button type="button" onClick={() => void navigator.clipboard.writeText(success.qrCodeText ?? '')}>Copiar código PIX</Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <Button
                variant="primary"
                disabled={loading || quoteLoading || !quote?.deliveryQuote.available}
                onClick={() => void handleCheckout()}
              >
                {loading ? 'Finalizando...' : 'Finalizar pedido'}
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
    </>
  );
}
