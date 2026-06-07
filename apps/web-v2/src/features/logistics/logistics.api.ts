import { apiFetch } from '@/lib/api-fetch';

export type DriverStatus = 'OFFLINE' | 'AVAILABLE' | 'ON_DELIVERY';

export type LogisticsDriver = {
  id: string;
  name: string;
  phone?: string | null;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  document?: string | null;
  commissionType?: string | null;
  commissionValue?: number | null;
  status: DriverStatus;
  isOnline: boolean;
  isActive: boolean;
  deliveriesCount?: number;
  deliveriesToday?: number;
  deliveredToday?: number;
  failedToday?: number;
  openDeliveries?: number;
  averageDeliveryMinutes?: number;
  payoutToday?: number;
  createdAt: string;
  updatedAt: string;
};

export type LogisticsSummary = {
  branchId: string;
  activeDrivers: number;
  onlineDrivers: number;
  availableDrivers: number;
  onDeliveryDrivers: number;
  deliveriesToday: number;
  failedToday: number;
  openDeliveries: number;
  pendingDispatchOrders: number;
  deliveredToday: number;
  averageDeliveryMinutes: number;
  courierPayoutToday: number;
  health: 'OK' | 'ATTENTION' | 'REVIEW';
  provider: string;
};

export type LogisticsAssignmentStatus = 'UNASSIGNED' | 'ASSIGNED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';

export type LogisticsDelivery = {
  id: string;
  assignedAt: string;
  outForDeliveryAt?: string | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
  failedReason?: string | null;
  status: Exclude<LogisticsAssignmentStatus, 'UNASSIGNED'>;
  elapsedMinutes: number;
  courier: { id: string; name: string; phone?: string | null; status: DriverStatus; isActive: boolean };
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    totalAmount: number;
    deliveryFee: number;
    createdAt: string;
    trackingToken?: string | null;
    trackingUrl?: string | null;
    customer?: { name: string; phone?: string | null; whatsapp?: string | null } | null;
    customerAddress?: LogisticsAddress | null;
  };
};

export type LogisticsAddress = {
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  reference?: string | null;
};

export type LogisticsAssignableOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  deliveryFee: number;
  createdAt: string;
  readyAt?: string | null;
  publicTrackingToken?: string | null;
  trackingUrl?: string | null;
  customer?: { name: string; phone?: string | null; whatsapp?: string | null } | null;
  address?: LogisticsAddress | null;
  assignmentStatus: LogisticsAssignmentStatus;
  courier?: { id: string; name: string; phone?: string | null; status: DriverStatus; isActive: boolean } | null;
  deliveryId?: string | null;
  waitingMinutes: number;
  canAssign: boolean;
  dispatchBlockers?: string[];
};

export function getLogisticsSummary() {
  return apiFetch<LogisticsSummary>('/v2/logistics/summary', { method: 'GET' });
}

export function listDrivers() {
  return apiFetch<{ branchId: string; items: LogisticsDriver[] }>('/v2/logistics/drivers', { method: 'GET' });
}

export function createDriver(input: Partial<LogisticsDriver>) {
  return apiFetch<LogisticsDriver>('/v2/logistics/drivers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateDriver(id: string, input: Partial<LogisticsDriver>) {
  return apiFetch<LogisticsDriver>(`/v2/logistics/drivers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function listDeliveries(limit = 50) {
  return apiFetch<{ branchId: string; items: LogisticsDelivery[] }>(`/v2/logistics/deliveries?limit=${limit}`, {
    method: 'GET',
  });
}

export function listAssignableOrders(limit = 80) {
  return apiFetch<{ branchId: string; items: LogisticsAssignableOrder[] }>(
    `/v2/logistics/orders/assignable?limit=${limit}`,
    { method: 'GET' },
  );
}

export function assignDriver(orderId: string, driverId: string) {
  return apiFetch<{ delivery: LogisticsDelivery; order: { id: string; orderNumber: string; status: string }; tracking: string }>(
    `/v2/logistics/orders/${orderId}/assign-driver`,
    {
      method: 'POST',
      body: JSON.stringify({ driverId }),
    },
  );
}

export function updateDeliveryStatus(id: string, status: 'ASSIGNED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED') {
  return apiFetch<{ delivery: LogisticsDelivery; status: string }>(`/v2/logistics/deliveries/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
