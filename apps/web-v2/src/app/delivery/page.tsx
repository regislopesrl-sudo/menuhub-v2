'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';
import { useCart } from '@/features/cart/use-cart';
import { submitDeliveryCheckout } from '@/features/checkout/checkout.api';
import { postCheckoutQuote, type CheckoutQuoteResponse } from '@/features/checkout/checkout-quote.api';
import { fetchPixPaymentStatus } from '@/features/checkout/payment-status.api';
import { fetchDeliveryMenu, getMenuFallback } from '@/features/menu/menu.api';
import type { MenuProduct } from '@/features/menu/menu.mock';

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

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const deliveryFee = quote?.deliveryFee ?? 0;
  const estimatedTotal = quote?.total ?? Math.max(0, subtotal + deliveryFee);

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
        if (active) {
          setMenuLoading(false);
        }
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
      if (cep.replace(/\D/g, '').length !== 8 || !number.trim()) {
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
          deliveryAddress: {
            cep,
            number,
          },
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
  }, [headers, cep, number, items, couponCode]);

  useEffect(() => {
    if (!success?.providerPaymentId) return;
    if (success.paymentStatus !== 'PENDING') return;

    let stopped = false;
    const interval = setInterval(async () => {
      try {
        const status = await fetchPixPaymentStatus({
          headers,
          providerPaymentId: success.providerPaymentId!,
        });
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
          setPaymentStatusMessage('Pagamento aprovado.');
          clearInterval(interval);
        } else if (status.paymentStatus === 'DECLINED') {
          setPaymentStatusMessage('Pagamento recusado.');
          clearInterval(interval);
        } else if (status.paymentStatus === 'EXPIRED') {
          setPaymentStatusMessage('Pagamento expirado.');
          clearInterval(interval);
        } else {
          setPaymentStatusMessage('Aguardando pagamento PIX...');
        }
      } catch {
        if (stopped) return;
        setPaymentStatusMessage('Aguardando pagamento PIX...');
      }
    }, 5000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [headers, success?.providerPaymentId, success?.paymentStatus]);

  const validateCheckoutForm = (): string | null => {
    if (!customerName.trim()) return 'Informe seu nome.';
    if (!customerPhone.trim()) return 'Informe seu telefone.';
    if (cep.replace(/\D/g, '').length !== 8) return 'Informe um CEP valido.';
    if (!street.trim()) return 'Informe a rua.';
    if (!number.trim()) return 'Informe o numero.';
    if (!neighborhood.trim()) return 'Informe o bairro.';
    if (items.length === 0) return 'Seu carrinho esta vazio.';
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
        customer: {
          name: customerName.trim(),
          phone: customerPhone.trim(),
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
      });

      setSuccess({
        orderId: response.order.id,
        orderNumber: (response.order as { orderNumber?: string }).orderNumber,
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
    if (validationErrors.length > 0) {
      return;
    }

    const selectedAddonData = (customizingProduct.addonGroups ?? []).flatMap((group) =>
      group.options
        .filter((option) => selectedAddons.includes(`${group.id}:${option.id}`))
        .map((option) => ({
          groupId: group.id,
          optionId: option.id,
          name: option.name,
          price: option.price,
        })),
    );

    addItem(customizingProduct, selectedAddonData);
    setCustomizingProduct(null);
    setSelectedAddons([]);
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Delivery V2</h1>
      <p className={styles.muted}>Escolha produtos, personalize com adicionais e finalize seu pedido.</p>

      <div className={styles.layout}>
        <section className={styles.products}>
          {menuLoading ? <p className={styles.muted}>Carregando cardapio...</p> : null}
          {menuError ? <div className={styles.feedbackError}>{menuError}</div> : null}
          {!menuLoading && products.length === 0 ? (
            <div className={styles.feedbackError}>Nenhum produto disponivel para delivery.</div>
          ) : null}
          {products.map((product) => (
            <article key={product.id} className={styles.productCard}>
              <div className={styles.productTop}>
                <div>
                  <div className={styles.productName}>{product.name}</div>
                  <div className={styles.muted}>{product.description}</div>
                </div>
                <strong>{brl(product.price)}</strong>
              </div>
              <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => openCustomize(product)}>
                {product.addonGroups && product.addonGroups.length > 0 ? 'Personalizar' : 'Adicionar'}
              </button>
            </article>
          ))}
        </section>

        <aside className={`${styles.cart} ${styles.mobileSticky}`}>
          <div className={styles.row}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Carrinho</h2>
            <span className={styles.muted}>{totalItems} itens</span>
          </div>

          <label className={styles.muted}>Nome</label>
          <input className={styles.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Seu nome" />

          <label className={styles.muted}>Telefone</label>
          <input
            className={styles.input}
            value={customerPhone}
            onChange={(e) => setCustomerPhone(normalizePhone(e.target.value))}
            placeholder="(11) 99999-0000"
          />

          <label className={styles.muted}>CEP</label>
          <input
            className={styles.input}
            value={cep}
            onChange={(e) => setCep(e.target.value)}
            placeholder="00000-000"
          />

          <label className={styles.muted}>Rua</label>
          <input className={styles.input} value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Rua" />

          <div className={styles.row}>
            <div style={{ flex: 1 }}>
              <label className={styles.muted}>Numero</label>
              <input className={styles.input} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="123" />
            </div>
            <div style={{ flex: 2 }}>
              <label className={styles.muted}>Bairro</label>
              <input className={styles.input} value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Centro" />
            </div>
          </div>

          <label className={styles.muted}>Cidade (opcional)</label>
          <input className={styles.input} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" />

          <label className={styles.muted}>Referencia (opcional)</label>
          <input className={styles.input} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Perto de..." />

          {items.length === 0 ? <p className={styles.muted}>Nenhum item no carrinho.</p> : null}

          {items.map((item, index) => {
            const addonPrice = item.addons.reduce((sum, addon) => sum + addon.price, 0);
            return (
              <div key={`${item.productId}-${index}`} className={styles.cartItem}>
                <div className={styles.row}>
                  <strong>{item.name}</strong>
                  <strong>{brl(item.quantity * (item.unitPrice + addonPrice))}</strong>
                </div>
                {item.addons.length > 0 ? (
                  <div className={styles.muted}>+ {item.addons.map((addon) => `${addon.name} (${brl(addon.price)})`).join(', ')}</div>
                ) : null}
                <div className={styles.row}>
                  <span className={styles.muted}>{brl(item.unitPrice + addonPrice)} cada</span>
                  <div className={styles.qtyControls}>
                    <button className={styles.button} onClick={() => updateQuantity(index, item.quantity - 1)}>
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button className={styles.button} onClick={() => updateQuantity(index, item.quantity + 1)}>
                      +
                    </button>
                    <button className={`${styles.button} ${styles.buttonDanger}`} onClick={() => removeItem(index)}>
                      Remover
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <label className={styles.muted}>Cupom</label>
          <input
            className={styles.input}
            placeholder="Ex: BEMVINDO10"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
          />

          <label className={styles.muted}>Pagamento</label>
          <select className={styles.select} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="PIX">PIX</option>
            <option value="CREDIT_CARD">Cartao de credito</option>
            <option value="CASH">Dinheiro</option>
          </select>

          <div className={styles.row}>
            <span>Subtotal</span>
            <strong>{brl(subtotal)}</strong>
          </div>
          <div className={styles.row}>
            <span>Frete {quoteLoading ? '(cotando...)' : ''}</span>
            <strong>{brl(deliveryFee)}</strong>
          </div>
          {quote ? (
            <div className={styles.muted}>
              Area: {quote.deliveryQuote.areaName ?? '-'} | Distancia: {quote.deliveryQuote.distanceKm ?? 0} km | Tempo: {Math.ceil((quote.deliveryQuote.durationSeconds ?? 0) / 60)} min
            </div>
          ) : null}
          <div className={styles.row}>
            <span>Total estimado</span>
            <strong>{brl(estimatedTotal)}</strong>
          </div>

          {quoteError ? <div className={styles.feedbackError}>{quoteError}</div> : null}
          {error ? <div className={styles.feedbackError}>{error}</div> : null}
          {success ? (
            <div className={styles.feedbackSuccess}>
              Pedido criado com sucesso. ID: {success.orderId} | Total: {brl(success.total)}
              <div>Pedido: {success.orderStatus}</div>
              <div>Pagamento: {success.paymentStatus}</div>
              {paymentStatusMessage ? <div>{paymentStatusMessage}</div> : null}
              {success.orderNumber ? <div>Numero do pedido: {success.orderNumber}</div> : null}
              {success.provider ? <div>Provider: {success.provider}</div> : null}
              {success.providerPaymentId ? <div>Provider Payment ID: {success.providerPaymentId}</div> : null}
              {success.paymentStatus === 'PENDING' && success.qrCodeText ? (
                <div style={{ marginTop: 10 }}>
                  <strong>Aguardando pagamento PIX</strong>
                  <div className={styles.muted}>Expira em: {success.expiresAt ? new Date(success.expiresAt).toLocaleString('pt-BR') : '-'}</div>
                  {success.qrCode ? <img src={success.qrCode} alt="QR Code PIX" style={{ maxWidth: 180, marginTop: 8 }} /> : null}
                  <div style={{ wordBreak: 'break-all', marginTop: 8 }}>{success.qrCodeText}</div>
                  <button
                    className={styles.button}
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(success.qrCodeText ?? '')}
                  >
                    Copiar codigo PIX
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <button
            className={`${styles.button} ${styles.buttonPrimary}`}
            disabled={loading || quoteLoading || !quote?.deliveryQuote.available}
            onClick={() => void handleCheckout()}
          >
            {loading ? 'Finalizando...' : 'Finalizar pedido'}
          </button>
        </aside>
      </div>

      {customizingProduct ? (
        <div className={styles.modalBackdrop} onClick={() => setCustomizingProduct(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
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
                          {group.required ? 'Obrigatorio' : 'Opcional'} | Min {group.minSelect} | Max {group.maxSelect}{' '}
                          | {group.allowMultiple ? 'Multiplas opcoes permitidas' : 'Apenas uma opcao'}
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
                    <strong>Total unitario: {brl(customizingProduct.price + addonTotal(customizingProduct, selectedAddons))}</strong>
                    <div className={styles.qtyControls}>
                      <button className={styles.button} onClick={() => setCustomizingProduct(null)}>
                        Cancelar
                      </button>
                      <button
                        className={`${styles.button} ${styles.buttonPrimary}`}
                        onClick={confirmCustomize}
                        disabled={localErrors.length > 0}
                      >
                        Adicionar ao carrinho
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
    </main>
  );
}
