import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
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

export interface CheckoutQuoteInput {
  storeId: string;
  items: DeliveryCheckoutInput['items'];
  couponCode?: string;
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

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(MENU_PORT_TOKEN) private readonly menuPort: MenuPort,
    private readonly paymentPort: PaymentPortMock,
    private readonly deliveryQuoteService: DeliveryQuoteService,
    private readonly paymentsService: PaymentsService,
    private readonly orderRepository: OrderPrismaRepository,
    private readonly ordersEvents: OrdersEventsService,
    private readonly pdvService: PdvService,
  ) {}

  async quoteDeliveryCheckout(input: CheckoutQuoteInput, ctx: RequestContext): Promise<CheckoutQuoteOutput> {
    this.validateQuoteInput(input);

    const validated = await this.menuPort.validateItems({
      companyId: ctx.companyId,
      storeId: input.storeId,
      channel: 'delivery',
      items: input.items,
    });

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
      channel: 'delivery',
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

  async runDeliveryCheckout(input: DeliveryCheckoutInput, ctx: RequestContext): Promise<CheckoutResult> {
    this.validateCustomerAndAddress(input);

    const preview = await this.quoteDeliveryCheckout(
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

    const trackingToken = this.generateTrackingToken();
    const checkoutResult = await orderCore.checkout(
      {
        ...input,
        companyId: ctx.companyId,
        deliveryFee: preview.deliveryFee,
      },
      {
        menuPort: this.menuPort,
        paymentPort: this.paymentPort as PaymentPort,
      },
    );

    const persisted = await this.orderRepository.createOrder(checkoutResult, ctx, preview.deliveryQuote, {
      publicTrackingToken: trackingToken,
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
          trackingToken,
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

    if (input.paymentMethod.toUpperCase() === 'CREDIT_CARD') {
      const card = await this.paymentsService.createOnlineCardPayment(
        {
          id: persisted.id,
          orderNumber: persisted.orderNumber,
          total: checkoutResult.order.totals.total,
        },
        ctx,
        input.cardPayment,
      );
      await this.orderRepository.attachPaymentIntent(persisted.id, card, ctx);

      return {
        ...checkoutResult,
        order: {
          ...checkoutResult.order,
          id: persisted.id,
          orderNumber: persisted.orderNumber,
          trackingToken,
        },
        payment: {
          ...checkoutResult.payment,
          id: card.id,
          provider: card.provider,
          providerPaymentId: card.providerPaymentId,
          method: 'CREDIT_CARD',
          status: card.status,
          transactionId: card.providerPaymentId,
          reason: card.message,
        },
      };
    }

    return {
      ...checkoutResult,
      order: {
        ...checkoutResult.order,
        id: persisted.id,
        orderNumber: persisted.orderNumber,
        trackingToken,
      },
    };
  }
  async runPdvCheckout(input: PdvCheckoutInput, ctx: RequestContext): Promise<CheckoutResult> {
    this.validatePdvInput(input);

    const validated = await this.menuPort.validateItems({
      companyId: ctx.companyId,
      storeId: input.storeId,
      channel: 'pdv',
      items: input.items,
    });

    const draft = orderCore.createOrder({
      channel: 'pdv',
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

    const payment = this.buildImmediatePdvPayment(input.paymentMethod, discounted.id);
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

    let response: CheckoutResult = {
      ...checkoutResult,
      order: {
        ...checkoutResult.order,
        id: persisted.id,
        orderNumber: persisted.orderNumber,
      },
    };

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

  private generateTrackingToken(): string {
    return randomBytes(24).toString('hex');
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

  private validateCustomerAndAddress(input: DeliveryCheckoutInput): void {
    const { customer, deliveryAddress } = input;
    if (!customer?.name?.trim()) {
      throw new BadRequestException('Nome do cliente e obrigatorio.');
    }
    if (!customer?.phone?.trim()) {
      throw new BadRequestException('Telefone do cliente e obrigatorio.');
    }
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

  private validatePdvInput(input: PdvCheckoutInput): void {
    if (!input.storeId?.trim()) {
      throw new BadRequestException('storeId e obrigatorio.');
    }
    if (!input.items?.length) {
      throw new BadRequestException('Carrinho vazio: informe ao menos um item.');
    }
    if (!input.paymentMethod?.trim()) {
      throw new BadRequestException('paymentMethod e obrigatorio.');
    }
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

  private mapPdvPaymentMethod(method: string): 'PIX' | 'CREDIT_CARD' | 'CASH' {
    const value = method.toUpperCase();
    if (value === 'PIX') return 'PIX';
    if (value === 'CARD' || value === 'CREDIT_CARD') return 'CREDIT_CARD';
    return 'CASH';
  }
}


