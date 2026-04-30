import type { OrderStatus } from '@prisma/client';
import type { RealtimeEventEnvelope } from './realtime-events';

export const CHECKOUT_CREATED_EVENT = 'checkout.created' as const;
export const CHECKOUT_PAID_EVENT = 'checkout.paid' as const;

export type CheckoutPaymentMethod = 'PIX' | 'CARD' | 'CASH' | 'PAY_ON_DELIVERY';
export type CheckoutPaymentStatus = 'pending' | 'authorized' | 'paid' | 'failed' | 'canceled';

export interface CheckoutRealtimeSummary {
  orderId: string;
  branchId: string;
  orderNumber: string;
  orderType: string;
  channel: string;
  status: OrderStatus;
  paymentMethod: CheckoutPaymentMethod;
  paymentStatus: CheckoutPaymentStatus;
  totalAmount: number | string;
  customerName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutCreatedEvent extends CheckoutRealtimeSummary {}

export interface CheckoutPaidEvent extends CheckoutRealtimeSummary {
  transactionReference?: string | null;
}

export type CheckoutCreatedEnvelope = RealtimeEventEnvelope<
  typeof CHECKOUT_CREATED_EVENT,
  CheckoutCreatedEvent
>;
export type CheckoutPaidEnvelope = RealtimeEventEnvelope<typeof CHECKOUT_PAID_EVENT, CheckoutPaidEvent>;
