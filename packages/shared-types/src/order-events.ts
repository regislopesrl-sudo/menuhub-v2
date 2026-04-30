import type { OrderStatus } from '@prisma/client';
import type { RealtimeEventEnvelope } from './realtime-events';

export const ORDER_CREATED_EVENT = 'order.created' as const;
export const ORDER_UPDATED_EVENT = 'order.updated' as const;
export const ORDER_STATUS_CHANGED_EVENT = 'order.status_changed' as const;
export const ORDER_STATUS_CHANGED_LEGACY_EVENT = 'order.status.changed' as const;
export const ORDER_STATUS_CHANGED_SNAKE_EVENT = 'order_status_changed' as const;
export const ORDER_CANCELED_EVENT = 'order.canceled' as const;
export const ORDER_CANCELLED_EVENT = 'order.cancelled' as const;
export const ORDER_PAID_EVENT = 'order.paid' as const;
export const ORDER_READY_EVENT = 'order.ready' as const;
export const KDS_ORDER_CREATED_EVENT = 'kds.order_created' as const;
export const KDS_ORDER_UPDATED_EVENT = 'kds.order_updated' as const;
export const STOCK_MOVEMENT_CREATED_EVENT = 'stock.movement.created' as const;
export const ALERT_CREATED_EVENT = 'alert.created' as const;
export const PAYMENT_FAILED_EVENT = 'payment.failed' as const;

export interface OrderRealtimeSummary {
  orderId: string;
  branchId: string;
  orderNumber: string;
  orderType: string;
  channel: string;
  status: OrderStatus;
  totalAmount: number | string;
  customerName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderUpdateEvent {
  orderId: string;
  branchId: string;
  previousStatus?: OrderStatus | null;
  newStatus: OrderStatus;
  updatedAt: string;
  order?: Partial<OrderRealtimeSummary> | null;
}

export interface OrderCreatedEvent extends OrderUpdateEvent {
  order: OrderRealtimeSummary;
}

export interface OrderCanceledEvent extends OrderUpdateEvent {
  reason?: string | null;
}

export interface OrderPaidEvent extends OrderUpdateEvent {
  paymentMethod: string;
  paymentStatus: 'paid';
  amount: number | string;
  transactionReference?: string | null;
}

export interface OrderReadyEvent extends OrderUpdateEvent {}

export interface KdsOrderCreatedEvent extends OrderPaidEvent {}

export interface KdsOrderUpdatedEvent extends OrderUpdateEvent {
  station?: string | null;
  itemId?: string | null;
  kdsStage?: string | null;
}

export interface StockMovementCreatedEvent {
  movementId: string;
  branchId?: string | null;
  stockItemId: string;
  movementType: string;
  quantity: number | string;
  previousStock?: number | string | null;
  newStock?: number | string | null;
  sourceModule?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  createdAt: string;
}

export interface AlertCreatedEvent {
  alertId: string;
  branchId?: string | null;
  code: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  resourceType?: string | null;
  resourceId?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface PaymentFailedEvent {
  orderId: string;
  branchId: string;
  paymentMethod: string;
  paymentStatus: 'failed';
  amount?: number | string | null;
  transactionReference?: string | null;
  reason?: string | null;
  updatedAt: string;
}

export type OrderRealtimeEventName =
  | typeof ORDER_CREATED_EVENT
  | typeof ORDER_UPDATED_EVENT
  | typeof ORDER_STATUS_CHANGED_EVENT
  | typeof ORDER_STATUS_CHANGED_LEGACY_EVENT
  | typeof ORDER_STATUS_CHANGED_SNAKE_EVENT
  | typeof ORDER_CANCELED_EVENT
  | typeof ORDER_CANCELLED_EVENT
  | typeof ORDER_PAID_EVENT
  | typeof ORDER_READY_EVENT
  | typeof KDS_ORDER_CREATED_EVENT
  | typeof KDS_ORDER_UPDATED_EVENT
  | typeof STOCK_MOVEMENT_CREATED_EVENT
  | typeof ALERT_CREATED_EVENT
  | typeof PAYMENT_FAILED_EVENT;

export type OrderCreatedEnvelope = RealtimeEventEnvelope<typeof ORDER_CREATED_EVENT, OrderCreatedEvent>;
export type OrderUpdatedEnvelope = RealtimeEventEnvelope<typeof ORDER_UPDATED_EVENT, OrderUpdateEvent>;
export type OrderStatusChangedEnvelope = RealtimeEventEnvelope<
  typeof ORDER_STATUS_CHANGED_EVENT,
  OrderUpdateEvent
>;
export type OrderCanceledEnvelope = RealtimeEventEnvelope<typeof ORDER_CANCELED_EVENT, OrderCanceledEvent>;
export type OrderPaidEnvelope = RealtimeEventEnvelope<typeof ORDER_PAID_EVENT, OrderPaidEvent>;
export type OrderReadyEnvelope = RealtimeEventEnvelope<typeof ORDER_READY_EVENT, OrderReadyEvent>;
export type KdsOrderCreatedEnvelope = RealtimeEventEnvelope<typeof KDS_ORDER_CREATED_EVENT, KdsOrderCreatedEvent>;
export type KdsOrderUpdatedEnvelope = RealtimeEventEnvelope<typeof KDS_ORDER_UPDATED_EVENT, KdsOrderUpdatedEvent>;
export type StockMovementCreatedEnvelope = RealtimeEventEnvelope<
  typeof STOCK_MOVEMENT_CREATED_EVENT,
  StockMovementCreatedEvent
>;
export type AlertCreatedEnvelope = RealtimeEventEnvelope<typeof ALERT_CREATED_EVENT, AlertCreatedEvent>;
export type PaymentFailedEnvelope = RealtimeEventEnvelope<typeof PAYMENT_FAILED_EVENT, PaymentFailedEvent>;
