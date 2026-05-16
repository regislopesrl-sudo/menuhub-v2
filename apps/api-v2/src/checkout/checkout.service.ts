import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { DeliveryCheckoutInput, PdvCheckoutInput } from '@delivery-futuro/shared-types';
import { orderCore, type CheckoutResult, type MenuPort, type PaymentPort } from '@delivery-futuro/order-core';
import { MENU_PORT_TOKEN } from '../ports/menu.tokens';
import { PaymentPortMock } from '../ports/payment.mock';
import type { RequestContext } from '../common/request-context';
import { OrderPrismaRepository } from '../orders/order.prisma';
import { OrdersEventsService } from '../orders/orders-events.service';
import { DeliveryQuoteService } from '../delivery/delivery-quote.service';
import { PaymentsService } from '../payments/payments.service';
import { PdvService } from '../pdv/pdv.service';
import { PrismaService } from '../database/prisma.service';
import { StockService } from '../stock/stock.service';

type PdvCheckoutInputExtended = Omit<PdvCheckoutInput, 'channel' | 'paymentMethod'> & {
  channel: 'pdv' | 'waiter_app';
  paymentMethod?: string;
  saleType?: 'COUNTER' | 'TABLE' | 'COMMAND';
  commandReference?: string;
};

export interface CheckoutQuoteInput {
  storeId: string;
  items: DeliveryCheckoutInput['items'];
  couponCode?: string;
  channel?: 'delivery' | 'kiosk';
  deliveryAddress: {
    cep: string;
    number: string;
  };
}

export interface CheckoutQuoteOutput {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  deliveryQuote: Awaited<ReturnType<DeliveryQuoteService['quoteByAddress']>>;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    selectedOptions: Array<{ groupId: string; optionId: string; name: string; price: number }>;
    totalPrice: number;
  }>;
}

type DeliveryCheckoutCustomerInput = DeliveryCheckoutInput['customer'] & {
  birthDate?: string;
  whatsappOptIn?: boolean;
};

type DeliveryCheckoutInputWithCustomer = Omit<DeliveryCheckoutInput, 'customer'> & {
  customer: DeliveryCheckoutCustomerInput;
};

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(MENU_PORT_TOKEN) private readonly menuPort: MenuPort,
    private readonly paymentPort: PaymentPortMock,
    private readonly deliveryQuoteService: DeliveryQuoteService,
    private readonly paymentsService: PaymentsService,
    private readonly prisma: PrismaService,
    private readonly orderRepository: OrderPrismaRepository,
    private readonly ordersEvents: OrdersEventsService,
    private readonly pdvService: PdvService,
    private readonly stockService: StockService,
  ) {}

  async quoteDeliveryCheckout(input: CheckoutQuoteInput, ctx: RequestContext): Promise<CheckoutQuoteOutput> {
    this.validateQuoteInput(input);

    const validated = await this.menuPort.validateItems({
      companyId: ctx.companyId,
      storeId: input.storeId,
      channel: input.channel ?? 'delivery',
      items: input.items,
    });
    await this.stockService.assertProductsAvailableForCheckout(ctx, validated.items);

    const subtotal = validated.items.reduce((sum, item) => {
      const optionsTotal = (item.selectedOptions ?? []).reduce((acc, option) => acc + option.price, 0);
      return sum + item.quantity * (item.unitPrice + optionsTotal);
    }, 0);

    const deliveryQuote = await this.deliveryQuoteService.quoteByAddress(ctx, {
      cep: input.deliveryAddress.cep,
      number: input.deliveryAddress.number,
      subtotal,
    });

    if (!deliveryQuote.available) {
      throw new BadRequestException(deliveryQuote.message ?? 'Endereco fora da area de entrega');
    }

    const draftOrder = orderCore.createOrder({
      channel: input.channel ?? 'delivery',
      items: validated.items,
      deliveryFee: deliveryQuote.fee,
      deliveryAddress: {
        cep: input.deliveryAddress.cep,
        street: '',
        number: input.deliveryAddress.number,
        neighborhood: '',
      },
    });

    const withTotals = {
      ...draftOrder,
      totals: orderCore.calculateTotal(draftOrder),
    };

    const discounted = orderCore.applyDiscount({
      order: withTotals,
      couponCode: input.couponCode,
    });

    return {
      subtotal: discounted.totals.subtotal,
      discount: discounted.totals.discount,
      deliveryFee: discounted.totals.deliveryFee,
      total: discounted.totals.total,
      deliveryQuote,
      items: validated.items.map((item) => {
        const optionSum = (item.selectedOptions ?? []).reduce((sum, option) => sum + option.price, 0);
        return {
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          selectedOptions: item.selectedOptions ?? [],
          totalPrice: Number((item.quantity * (item.unitPrice + optionSum)).toFixed(2)),
        };
      }),
    };
  }

  async runDeliveryCheckout(input: DeliveryCheckoutInputWithCustomer, ctx: RequestContext): Promise<CheckoutResult> {
    const fulfillmentType = input.fulfillmentType === 'TAKEOUT' ? 'TAKEOUT' : 'DELIVERY';
    this.validateCustomerAndAddress(input, fulfillmentType);
    this.validateScheduledAt(input.scheduledAt);
    const customerId = await this.upsertDeliveryCustomer(input, ctx);

    const preview =
      fulfillmentType === 'TAKEOUT'
        ? null
        : await this.quoteDeliveryCheckout(
            {
              storeId: input.storeId,
              items: input.items,
              couponCode: input.couponCode,
              deliveryAddress: {
                cep: input.deliveryAddress.cep ?? '',
                number: input.deliveryAddress.number,
              },
            },
            ctx,
          );
    const customerAddressId =
      fulfillmentType === 'DELIVERY' && customerId
        ? await this.upsertDeliveryCustomerAddress(input, customerId, preview?.deliveryQuote?.areaId ?? null)
        : null;

    const checkoutResult = await orderCore.checkout(
      {
        ...input,
        companyId: ctx.companyId,
        customerId,
        deliveryFee: preview?.deliveryFee ?? 0,
      },
      {
        menuPort: this.menuPort,
        paymentPort: this.paymentPort as PaymentPort,
      },
    );
    await this.stockService.assertProductsAvailableForCheckout(ctx, checkoutResult.order.items);

    const persisted = await this.orderRepository.createOrder(checkoutResult, ctx, preview?.deliveryQuote, {
      orderTypeOverride: fulfillmentType === 'TAKEOUT' ? 'PICKUP' : 'DELIVERY',
      checkoutMetadata: {
        fulfillmentType,
        scheduledAt: input.scheduledAt ?? null,
        customerBirthDate: input.customer.birthDate ?? null,
        customerWhatsappOptIn: input.customer.whatsappOptIn ?? null,
      },
      customerAddressId,
    });
    try {
      await this.ordersEvents.emitOrderCreated(
        {
          id: persisted.id,
          orderNumber: persisted.orderNumber,
          status: persisted.status,
        },
        ctx,
      );
    } catch {
      // emitter non-blocking by design
    }
    await this.consumeStockIfCreatedInOperationalStatus(persisted, ctx);

    if (input.paymentMethod.toUpperCase() === 'PIX') {
      const pix = await this.paymentsService.createPixPayment(
        {
          id: persisted.id,
          orderNumber: persisted.orderNumber,
          total: checkoutResult.order.totals.total,
        },
        ctx,
      );
      await this.orderRepository.attachPaymentIntent(persisted.id, pix, ctx);

      return {
        ...checkoutResult,
        order: {
          ...checkoutResult.order,
          id: persisted.id,
          orderNumber: persisted.orderNumber,
          trackingToken: persisted.publicTrackingToken ?? undefined,
        },
        payment: {
          ...checkoutResult.payment,
          id: pix.id,
          provider: pix.provider,
          providerPaymentId: pix.providerPaymentId,
          method: 'PIX',
          status: 'PENDING',
          qrCode: pix.qrCode,
          qrCodeText: pix.qrCodeText,
          expiresAt: pix.expiresAt,
        },
      };
    }

    return {
      ...checkoutResult,
      order: {
        ...checkoutResult.order,
        id: persisted.id,
        orderNumber: persisted.orderNumber,
        trackingToken: persisted.publicTrackingToken ?? undefined,
      },
    };
  }

  async runPdvCheckout(input: PdvCheckoutInputExtended, ctx: RequestContext): Promise<CheckoutResult> {
    this.validatePdvInput(input);

    const validated = await this.menuPort.validateItems({
      companyId: ctx.companyId,
      storeId: input.storeId,
      channel: input.channel,
      items: input.items,
    });
    await this.stockService.assertProductsAvailableForCheckout(ctx, validated.items);

    const draft = orderCore.createOrder({
      channel: input.channel,
      customerId: input.customerId,
      customer: input.customer,
      deliveryFee: 0,
      items: validated.items,
    });
    const withTotals = {
      ...draft,
      totals: orderCore.calculateTotal(draft),
    };
    const discounted = orderCore.applyDiscount({
      order: withTotals,
      couponCode: input.couponCode,
    });

    const pdvOrderType = input.saleType === 'TABLE' ? 'TABLE' : input.saleType === 'COMMAND' ? 'COMMAND' : 'COUNTER';
    const isDeferredPdvPayment = pdvOrderType === 'TABLE' || pdvOrderType === 'COMMAND';
    const payment = isDeferredPdvPayment
      ? this.buildDeferredPdvPayment(pdvOrderType)
      : this.buildImmediatePdvPayment(input.paymentMethod ?? 'CASH', discounted.id);
    const targetStatus = input.startInPreparation ? 'PREPARING' : 'CONFIRMED';
    const finalOrder = orderCore.updateStatus(
      discounted,
      payment.status === 'DECLINED' ? 'PAYMENT_FAILED' : targetStatus,
    );
    const checkoutResult: CheckoutResult = {
      order: finalOrder,
      payment,
    };

    const session = await this.pdvService.getOpenSessionOrThrow(ctx);
    const persisted = await this.orderRepository.createOrder(checkoutResult, ctx, undefined, {
      pdvSessionId: session.id,
      pdvOrderType,
      commandReference: input.commandReference,
    });
    try {
      await this.ordersEvents.emitOrderCreated(
        {
          id: persisted.id,
          orderNumber: persisted.orderNumber,
          status: persisted.status,
        },
        ctx,
      );
    } catch {
      // emitter non-blocking by design
    }
    await this.consumeStockIfCreatedInOperationalStatus(persisted, ctx);

    let response: CheckoutResult = {
      ...checkoutResult,
      order: {
        ...checkoutResult.order,
        id: persisted.id,
      },
    };

    if (!isDeferredPdvPayment && input.paymentMethod?.toUpperCase() === 'PIX') {
      const pix = await this.paymentsService.createPixPayment(
        {
          id: persisted.id,
          orderNumber: persisted.orderNumber,
          total: checkoutResult.order.totals.total,
        },
        ctx,
      );
      await this.orderRepository.attachPaymentIntent(persisted.id, pix, ctx);
      response = {
        ...response,
        payment: {
          ...response.payment,
          id: pix.id,
          provider: pix.provider,
          providerPaymentId: pix.providerPaymentId,
          method: 'PIX',
          status: 'PENDING',
          qrCode: pix.qrCode,
          qrCodeText: pix.qrCodeText,
          expiresAt: pix.expiresAt,
        },
      };
    }

    return response;
  }

  private async consumeStockIfCreatedInOperationalStatus(
    order: { id: string; status?: string | null },
    ctx: RequestContext,
  ) {
    if (!this.shouldConsumeStockOnCreatedStatus(order.status)) return;
    const consumeByOrder = (this.stockService as any).consumeByOrder;
    if (typeof consumeByOrder !== 'function') return;

    try {
      await consumeByOrder.call(this.stockService, ctx, order.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida na baixa automatica de estoque.';
      const addInternalNote = (this.orderRepository as any).addInternalNote;
      if (typeof addInternalNote !== 'function') return;
      try {
        await addInternalNote.call(this.orderRepository, order.id, ctx, `Falha na baixa automatica de estoque: ${message}`);
      } catch {
        // best effort; checkout must not fail because of the audit note
      }
    }
  }

  private shouldConsumeStockOnCreatedStatus(status?: string | null): boolean {
    return (
      status === 'IN_PREPARATION' ||
      status === 'READY' ||
      status === 'OUT_FOR_DELIVERY' ||
      status === 'DELIVERED' ||
      status === 'FINALIZED'
    );
  }

  private validateQuoteInput(input: CheckoutQuoteInput): void {
    if (!input.storeId?.trim()) {
      throw new BadRequestException('storeId e obrigatorio.');
    }
    if (!input.items?.length) {
      throw new BadRequestException('Carrinho vazio: informe ao menos um item.');
    }
    if (!input.deliveryAddress?.cep?.trim()) {
      throw new BadRequestException('CEP e obrigatorio.');
    }
    if (!input.deliveryAddress?.number?.trim()) {
      throw new BadRequestException('Numero e obrigatorio.');
    }
  }

  private validateCustomerAndAddress(input: DeliveryCheckoutInput, fulfillmentType: 'DELIVERY' | 'TAKEOUT'): void {
    const { customer, deliveryAddress } = input;
    if (!customer?.name?.trim()) {
      throw new BadRequestException('Nome do cliente e obrigatorio.');
    }
    if (!customer?.phone?.trim()) {
      throw new BadRequestException('Telefone do cliente e obrigatorio.');
    }
    if (fulfillmentType === 'DELIVERY') {
      if (!deliveryAddress?.cep?.trim()) {
        throw new BadRequestException('CEP e obrigatorio.');
      }
      if (!deliveryAddress?.street?.trim()) {
        throw new BadRequestException('Rua e obrigatoria.');
      }
      if (!deliveryAddress?.number?.trim()) {
        throw new BadRequestException('Numero e obrigatorio.');
      }
      if (!deliveryAddress?.neighborhood?.trim()) {
        throw new BadRequestException('Bairro e obrigatorio.');
      }
    }
  }

  private validateScheduledAt(scheduledAt?: string): void {
    if (!scheduledAt?.trim()) return;
    const dt = new Date(scheduledAt);
    if (Number.isNaN(dt.getTime())) {
      throw new BadRequestException('scheduledAt invalido.');
    }
    if (dt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('scheduledAt deve estar no futuro.');
    }
  }

  private async upsertDeliveryCustomer(input: DeliveryCheckoutInputWithCustomer, ctx: RequestContext): Promise<string | undefined> {
    const phone = this.normalizePhone(input.customer.phone);
    const name = input.customer.name.trim();
    const birthDate = this.parseOptionalDate(input.customer.birthDate, 'Data de nascimento invalida.');
    const whatsapp = input.customer.whatsappOptIn === false ? null : phone;

    const existing = input.customerId
      ? await this.prisma.customer.findFirst({
          where: {
            id: input.customerId,
            companyId: ctx.companyId,
            deletedAt: null,
          },
          select: { id: true },
        })
      : await this.prisma.customer.findFirst({
          where: {
            companyId: ctx.companyId,
            deletedAt: null,
            OR: [{ phone }, { whatsapp: phone }],
          },
          select: { id: true },
        });

    if (existing) {
      const updated = await this.prisma.customer.update({
        where: { id: existing.id },
        data: {
          name,
          phone,
          whatsapp,
          ...(birthDate ? { birthDate } : {}),
        },
        select: { id: true },
      });
      return updated.id;
    }

    const created = await this.prisma.customer.create({
      data: {
        companyId: ctx.companyId,
        name,
        phone,
        whatsapp,
        ...(birthDate ? { birthDate } : {}),
      },
      select: { id: true },
    });
    return created.id;
  }

  private async upsertDeliveryCustomerAddress(
    input: DeliveryCheckoutInputWithCustomer,
    customerId: string,
    deliveryAreaId: string | null,
  ): Promise<string | null> {
    const address = input.deliveryAddress;
    const zipCode = address.cep?.trim() ?? null;
    const street = address.street.trim();
    const number = address.number.trim();
    const district = address.neighborhood.trim();
    const { city, state } = this.parseCityState(address.city);

    const existing = await this.prisma.customerAddress.findFirst({
      where: {
        customerId,
        zipCode,
        street,
        number,
      },
      select: { id: true },
    });

    const data = {
      deliveryAreaId,
      label: 'Entrega',
      zipCode,
      street,
      number,
      district,
      city,
      state,
      reference: address.reference?.trim() || null,
      isDefault: true,
    };

    if (existing) {
      const updated = await this.prisma.customerAddress.update({
        where: { id: existing.id },
        data,
        select: { id: true },
      });
      return updated.id;
    }

    const created = await this.prisma.customerAddress.create({
      data: {
        customerId,
        ...data,
      },
      select: { id: true },
    });
    return created.id;
  }

  private validatePdvInput(input: PdvCheckoutInputExtended): void {
    if (!input.storeId?.trim()) {
      throw new BadRequestException('storeId e obrigatorio.');
    }
    if (!input.items?.length) {
      throw new BadRequestException('Carrinho vazio: informe ao menos um item.');
    }
    const saleType = input.saleType === 'TABLE' || input.saleType === 'COMMAND' ? input.saleType : 'COUNTER';
    if (saleType === 'COUNTER' && !input.paymentMethod?.trim()) {
      throw new BadRequestException('paymentMethod e obrigatorio.');
    }
    if ((saleType === 'TABLE' || saleType === 'COMMAND') && !input.commandReference?.trim()) {
      throw new BadRequestException(saleType === 'TABLE' ? 'Informe a mesa.' : 'Informe a comanda.');
    }
  }

  private normalizePhone(value: string): string {
    return value.replace(/\D/g, '');
  }

  private parseOptionalDate(value: string | undefined, message: string): Date | undefined {
    if (!value?.trim()) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(message);
    }
    return parsed;
  }

  private parseCityState(value: string | undefined): { city: string; state: string } {
    const raw = value?.trim();
    if (!raw) return { city: 'Nao informado', state: 'NA' };
    const [cityPart, statePart] = raw.split('/').map((part) => part.trim()).filter(Boolean);
    return {
      city: cityPart || raw,
      state: (statePart || 'NA').slice(0, 2).toUpperCase(),
    };
  }

  private buildImmediatePdvPayment(method: string, orderId: string): CheckoutResult['payment'] {
    if (method.toUpperCase() === 'DENY') {
      return {
        status: 'DECLINED',
        reason: 'Pagamento recusado pelo mock',
      };
    }

    return {
      status: 'APPROVED',
      transactionId: `pdv_txn_${orderId}`,
      method: this.mapPdvPaymentMethod(method),
    };
  }

  private buildDeferredPdvPayment(saleType: 'TABLE' | 'COMMAND'): CheckoutResult['payment'] {
    return {
      status: 'PENDING',
      reason: saleType === 'TABLE'
        ? 'Pagamento sera realizado no fechamento da mesa.'
        : 'Pagamento sera realizado no fechamento da comanda.',
    };
  }

  private mapPdvPaymentMethod(method: string): 'PIX' | 'CREDIT_CARD' | 'CASH' {
    const value = method.toUpperCase();
    if (value === 'PIX') return 'PIX';
    if (value === 'CARD' || value === 'CREDIT_CARD') return 'CREDIT_CARD';
    return 'CASH';
  }
}
