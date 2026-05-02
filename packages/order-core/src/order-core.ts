import type {
  CreateOrderInput,
  DeliveryCheckoutInput,
  Order,
  OrderStatus,
  OrderTotals,
  PaymentResult,
} from '@delivery-futuro/shared-types';
import type { MenuPort, PaymentPort } from './ports';
import type { ApplyDiscountInput, CheckoutResult } from './types';

export interface OrderCore {
  createOrder(input: CreateOrderInput): Order;
  calculateTotal(order: Order): OrderTotals;
  applyDiscount(input: ApplyDiscountInput): Order;
  updateStatus(order: Order, status: OrderStatus): Order;
  checkout(input: DeliveryCheckoutInput, deps: { menuPort: MenuPort; paymentPort: PaymentPort }): Promise<CheckoutResult>;
}

/**
 * Assinaturas e contratos do order-core.
 * Implementacao real sera adicionada em etapa posterior.
 */
export const orderCore: OrderCore = {
  createOrder(input: CreateOrderInput): Order {
    if (!input.items.length) {
      throw new Error('Carrinho vazio: informe ao menos um item');
    }

    return {
      id: `ord_${Date.now()}`,
      channel: input.channel,
      customerId: input.customerId,
      customer: input.customer,
      deliveryAddress: input.deliveryAddress,
      items: input.items,
      status: 'CREATED',
      totals: {
        subtotal: 0,
        deliveryFee: input.deliveryFee ?? 0,
        discount: 0,
        total: 0,
      },
      createdAt: new Date().toISOString(),
    };
  },
  calculateTotal(order: Order): OrderTotals {
    const subtotal = order.items.reduce((sum, item) => {
      const optionsTotal = (item.selectedOptions ?? []).reduce(
        (optionsSum: number, option: { price: number }) => optionsSum + option.price,
        0,
      );
      return sum + item.quantity * (item.unitPrice + optionsTotal);
    }, 0);
    const deliveryFee = order.totals.deliveryFee ?? (order.channel === 'delivery' ? 8 : 0);
    const discount = order.totals.discount ?? 0;
    return {
      subtotal,
      deliveryFee,
      discount,
      total: Math.max(0, subtotal + deliveryFee - discount),
    };
  },
  applyDiscount(input: ApplyDiscountInput): Order {
    const { order, couponCode } = input;
    const normalizedCoupon = couponCode?.trim().toUpperCase();
    let discount = 0;

    if (normalizedCoupon === 'BEMVINDO10') {
      discount = Number((order.totals.subtotal * 0.1).toFixed(2));
    }

    const totals: OrderTotals = {
      ...order.totals,
      discount,
      total: Math.max(0, Number((order.totals.subtotal + order.totals.deliveryFee - discount).toFixed(2))),
    };

    return {
      ...order,
      totals,
    };
  },
  updateStatus(order: Order, status: OrderStatus): Order {
    return {
      ...order,
      status,
    };
  },
  checkout(
    input: DeliveryCheckoutInput,
    deps: { menuPort: MenuPort; paymentPort: PaymentPort },
  ): Promise<CheckoutResult> {
    return (async () => {
      if (!input.items.length) {
        throw new Error('Carrinho vazio: informe ao menos um item');
      }

      for (const item of input.items) {
        if (item.quantity <= 0) {
          throw new Error(`Quantidade invalida para o item ${item.productId}: deve ser maior que zero`);
        }
      }

      const validated = await deps.menuPort.validateItems({
        companyId: input.companyId,
        storeId: input.storeId,
        channel: input.channel,
        items: input.items,
      });

      const createdOrder = orderCore.createOrder({
        channel: input.channel,
        customerId: input.customerId,
        customer: input.customer,
        deliveryAddress: input.deliveryAddress,
        deliveryFee: input.deliveryFee,
        items: validated.items,
      });

      const withTotals: Order = {
        ...createdOrder,
        totals: orderCore.calculateTotal(createdOrder),
      };

      const withDiscount = orderCore.applyDiscount({
        order: withTotals,
        couponCode: input.couponCode,
      });

      const payment = await deps.paymentPort.authorizePayment({
        orderId: withDiscount.id,
        amount: withDiscount.totals.total,
        method: input.paymentMethod,
      });

      const finalStatus: OrderStatus = payment.status === 'APPROVED' ? 'CONFIRMED' : 'PAYMENT_FAILED';
      const finalOrder = orderCore.updateStatus(withDiscount, finalStatus);

      return {
        order: finalOrder,
        payment,
      };
    })();
  },
};

export const orderCoreOutputExamples: {
  paymentResult: PaymentResult;
  checkoutResult: CheckoutResult;
} = {
  paymentResult: {
    status: 'APPROVED',
    transactionId: 'txn_001',
  },
  checkoutResult: {
    order: {
      id: 'ord_001',
      channel: 'delivery',
      customerId: 'cust_123',
      items: [{ productId: 'pizza_1', name: 'Pizza Calabresa', quantity: 1, unitPrice: 59.9 }],
      customer: { name: 'Joao', phone: '11999990000' },
      deliveryAddress: {
        street: 'Rua A',
        number: '100',
        neighborhood: 'Centro',
      },
      status: 'CONFIRMED',
      totals: { subtotal: 59.9, deliveryFee: 8, discount: 10, total: 57.9 },
      createdAt: '2026-04-30T12:00:00.000Z',
    },
    payment: {
      status: 'APPROVED',
      transactionId: 'txn_001',
    },
  },
};
