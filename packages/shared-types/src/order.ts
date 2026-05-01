export type OrderChannel = 'delivery' | 'pdv' | 'whatsapp' | 'kiosk' | 'waiter';

export type OrderStatus =
  | 'CREATED'
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'PAYMENT_FAILED';

export interface OrderItemInput {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  selectedOptions?: Array<{
    groupId: string;
    optionId: string;
    name: string;
    price: number;
  }>;
}

export interface OrderTotals {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
}

export interface Order {
  id: string;
  channel: OrderChannel;
  customerId?: string;
  customer?: {
    name: string;
    phone: string;
  };
  deliveryAddress?: {
    cep?: string;
    street: string;
    number: string;
    neighborhood: string;
    city?: string;
    reference?: string;
  };
  items: OrderItemInput[];
  status: OrderStatus;
  totals: OrderTotals;
  createdAt: string;
}

export interface CreateOrderInput {
  channel: OrderChannel;
  customerId?: string;
  customer?: {
    name: string;
    phone: string;
  };
  deliveryAddress?: {
    cep?: string;
    street: string;
    number: string;
    neighborhood: string;
    city?: string;
    reference?: string;
  };
  deliveryFee?: number;
  items: OrderItemInput[];
}

export interface DeliveryCheckoutInput {
  companyId: string;
  storeId: string;
  channel: 'delivery';
  customerId?: string;
  customer: {
    name: string;
    phone: string;
  };
  deliveryAddress: {
    cep?: string;
    street: string;
    number: string;
    neighborhood: string;
    city?: string;
    reference?: string;
  };
  deliveryFee?: number;
  items: Array<{
    productId: string;
    quantity: number;
    selectedOptions?: Array<{
      groupId: string;
      optionId: string;
      name: string;
      price: number;
    }>;
  }>;
  couponCode?: string;
  paymentMethod: string;
}

export interface PdvCheckoutInput {
  companyId: string;
  storeId: string;
  channel: 'pdv';
  customerId?: string;
  customer?: {
    name: string;
    phone: string;
  };
  items: Array<{
    productId: string;
    quantity: number;
    selectedOptions?: Array<{
      groupId: string;
      optionId: string;
      name: string;
      price: number;
    }>;
  }>;
  couponCode?: string;
  paymentMethod: string;
  startInPreparation?: boolean;
}
