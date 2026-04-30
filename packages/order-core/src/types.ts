import type {
  CreateOrderInput,
  DeliveryCheckoutInput,
  Order,
  OrderStatus,
  OrderTotals,
  PaymentResult,
} from '@delivery-futuro/shared-types';

export type { CreateOrderInput, DeliveryCheckoutInput, Order, OrderStatus, OrderTotals, PaymentResult };

export interface ApplyDiscountInput {
  order: Order;
  couponCode?: string;
}

export interface CheckoutResult {
  order: Order;
  payment: PaymentResult;
}

export const orderCoreExamples = {
  createOrderInput: {
    channel: 'delivery',
    customerId: 'cust_123',
    items: [{ productId: 'pizza_1', name: 'Pizza Calabresa', quantity: 1, unitPrice: 59.9 }],
  } satisfies CreateOrderInput,
  checkoutInput: {
    companyId: 'default-company',
    storeId: 'store_1',
    channel: 'delivery',
    customerId: 'cust_123',
    customer: { name: 'Cliente Exemplo', phone: '11999990000' },
    deliveryAddress: {
      street: 'Rua Exemplo',
      number: '123',
      neighborhood: 'Centro',
      city: 'Sao Paulo',
    },
    deliveryFee: 5,
    items: [{ productId: 'pizza_1', quantity: 1 }],
    couponCode: 'BEMVINDO10',
    paymentMethod: 'PIX',
  } satisfies DeliveryCheckoutInput,
};
