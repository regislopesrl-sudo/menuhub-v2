'use client';

import { io, Socket } from 'socket.io-client';
import type { OrdersHeaders } from './orders.api';
import { getAuthSession } from '@/lib/auth-session';

export type OrdersEventType = 'order.created' | 'order.status_updated';

export interface OrdersEventPayload {
  type: OrdersEventType;
  companyId: string;
  branchId?: string;
  orderId: string;
  orderNumber: string;
  status: string;
  timestamp: string;
  requestId: string;
}

export type SocketConnectionStatus = 'connecting' | 'connected' | 'disconnected';

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';
const WS_BASE = process.env.NEXT_PUBLIC_API_V2_WS_URL ?? API_BASE;

export function connectOrdersSocket(input: {
  headers: OrdersHeaders;
  onEvent: (event: OrdersEventPayload) => void;
  onConnectionStatus?: (status: SocketConnectionStatus) => void;
}): Socket {
  input.onConnectionStatus?.('connecting');

  const token = getAuthSession()?.accessToken;
  const socket = io(`${WS_BASE}/v2/orders`, {
    transports: ['websocket', 'polling'],
    withCredentials: false,
    query: {
      companyId: input.headers.companyId,
      ...(input.headers.branchId ? { branchId: input.headers.branchId } : {}),
    },
    auth: {
      companyId: input.headers.companyId,
      ...(input.headers.branchId ? { branchId: input.headers.branchId } : {}),
      ...(token ? { token } : {}),
    },
    extraHeaders: {
      'x-company-id': input.headers.companyId,
      ...(input.headers.branchId ? { 'x-branch-id': input.headers.branchId } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const handler = (eventType: OrdersEventType) => (payload: OrdersEventPayload) => {
    input.onEvent({ ...payload, type: eventType });
  };

  socket.on('connect', () => input.onConnectionStatus?.('connected'));
  socket.on('disconnect', () => input.onConnectionStatus?.('disconnected'));
  socket.on('connect_error', () => input.onConnectionStatus?.('disconnected'));
  socket.on('order.created', handler('order.created'));
  socket.on('order.status_updated', handler('order.status_updated'));

  return socket;
}
