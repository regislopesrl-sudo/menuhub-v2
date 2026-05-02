export type OrderEventType = 'order.created' | 'order.status_updated';

export interface OrderEventPayload {
  type: OrderEventType;
  companyId: string;
  branchId?: string;
  orderId: string;
  orderNumber: string;
  status: string;
  timestamp: string;
  requestId: string;
}

