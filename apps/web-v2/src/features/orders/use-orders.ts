'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getOrderById,
  getOrderSummary,
  listOrders,
  patchOrderStatus,
  type OrderDetail,
  type OrderListItem,
  type OrderSummary,
  type OrdersHeaders,
  type OrdersListResponse,
} from './orders.api';
import { connectOrdersSocket, type OrdersEventPayload, type SocketConnectionStatus } from './orders.socket';

export interface OrdersFilters {
  status?: string;
  channel?: string;
  paymentStatus?: string;
  activeOnly?: boolean;
  delayedOnly?: boolean;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'total' | 'status';
  sortDirection?: 'asc' | 'desc';
  createdFrom?: string;
  createdTo?: string;
}

export interface PaginationState {
  page: number;
  limit: number;
}

const DEFAULT_PAGINATION: PaginationState = { page: 1, limit: 20 };

export function useOrders(headers: OrdersHeaders) {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<OrdersFilters>({});
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION);
  const [paginationInfo, setPaginationInfo] = useState<OrdersListResponse['pagination']>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<SocketConnectionStatus>('connecting');

  const selectedOrderIdRef = useRef<string | null>(null);
  selectedOrderIdRef.current = selectedOrderId;

  const stableHeaders = useMemo(
    () => ({
      companyId: headers.companyId,
      branchId: headers.branchId,
      userRole: headers.userRole ?? 'admin',
    }),
    [headers.companyId, headers.branchId, headers.userRole],
  );

  const loadOrders = useCallback(
    async (nextPagination = pagination, nextFilters = filters) => {
      setLoading(true);
      setError(null);
      try {
        const response = await listOrders({
          headers: stableHeaders,
          page: nextPagination.page,
          limit: nextPagination.limit,
          status: nextFilters.status,
          channel: nextFilters.channel,
          paymentStatus: nextFilters.paymentStatus,
          activeOnly: nextFilters.activeOnly,
          delayedOnly: nextFilters.delayedOnly,
          search: nextFilters.search,
          sortBy: nextFilters.sortBy,
          sortDirection: nextFilters.sortDirection,
          createdFrom: nextFilters.createdFrom,
          createdTo: nextFilters.createdTo,
        });

        setOrders(response.data);
        setPaginationInfo(response.pagination);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar pedidos.');
      } finally {
        setLoading(false);
      }
    },
    [filters, pagination, stableHeaders],
  );

  const loadSummary = useCallback(
    async (nextFilters = filters) => {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const response = await getOrderSummary({
          headers: stableHeaders,
          dateFrom: nextFilters.createdFrom,
          dateTo: nextFilters.createdTo,
          channel: nextFilters.channel,
        });
        setSummary(response);
      } catch (err) {
        setSummaryError(err instanceof Error ? err.message : 'Erro ao carregar resumo de pedidos.');
      } finally {
        setSummaryLoading(false);
      }
    },
    [filters, stableHeaders],
  );

  const loadOrderDetail = useCallback(
    async (orderId: string) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const detail = await getOrderById({ id: orderId, headers: stableHeaders });
        setSelectedOrder(detail);
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : 'Erro ao carregar detalhe do pedido.');
      } finally {
        setDetailLoading(false);
      }
    },
    [stableHeaders],
  );

  const upsertOrderFromEvent = useCallback(
    async (orderId: string) => {
      try {
        const detail = await getOrderById({ id: orderId, headers: stableHeaders });
        setOrders((current) => upsertListItem(current, detailToListItem(detail)));
        void loadSummary();
      } catch {
        void loadOrders();
        void loadSummary();
      }
    },
    [loadOrders, loadSummary, stableHeaders],
  );

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const socket = connectOrdersSocket({
      headers: stableHeaders,
      onConnectionStatus: setSocketStatus,
      onEvent: (event: OrdersEventPayload) => {
        void upsertOrderFromEvent(event.orderId);
        if (selectedOrderIdRef.current && selectedOrderIdRef.current === event.orderId) {
          void loadOrderDetail(event.orderId);
        }
      },
    });

    return () => {
      socket.disconnect();
      setSocketStatus('disconnected');
    };
  }, [loadOrderDetail, stableHeaders, upsertOrderFromEvent]);

  const reload = useCallback(async () => {
    await loadOrders();
    await loadSummary();
    if (selectedOrderIdRef.current) {
      await loadOrderDetail(selectedOrderIdRef.current);
    }
  }, [loadOrderDetail, loadOrders, loadSummary]);

  const setFilters = useCallback((next: OrdersFilters) => {
    setFiltersState(next);
    const reset = { ...pagination, page: 1 };
    setPagination(reset);
    void loadOrders(reset, next);
    void loadSummary(next);
  }, [loadOrders, loadSummary, pagination]);

  const changePage = useCallback((page: number) => {
    const next = { ...pagination, page };
    setPagination(next);
    void loadOrders(next, filters);
  }, [filters, loadOrders, pagination]);

  const changeLimit = useCallback((limit: number) => {
    const next = { page: 1, limit };
    setPagination(next);
    void loadOrders(next, filters);
  }, [filters, loadOrders]);

  const openOrderDetail = useCallback((orderId: string) => {
    setSelectedOrderId(orderId);
    setSelectedOrder(null);
    void loadOrderDetail(orderId);
  }, [loadOrderDetail]);

  const closeOrderDetail = useCallback(() => {
    setSelectedOrderId(null);
    setSelectedOrder(null);
    setDetailError(null);
  }, []);

  const updateOrderStatus = useCallback(
    async (id: string, status: string) => {
      setIsUpdatingStatus(status);
      setError(null);
      setDetailError(null);
      try {
        const updated = await patchOrderStatus({ id, status, headers: stableHeaders });
        setSelectedOrder(updated);
        setOrders((current) => upsertListItem(current, detailToListItem(updated)));
        void loadSummary();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao atualizar status do pedido.';
        setError(message);
        setDetailError(message);
      } finally {
        setIsUpdatingStatus(null);
      }
    },
    [loadSummary, stableHeaders],
  );

  return {
    orders,
    loading,
    error,
    summary,
    summaryLoading,
    summaryError,
    filters,
    pagination,
    paginationInfo,
    socketStatus,
    selectedOrderId,
    selectedOrder,
    detailLoading,
    detailError,
    isUpdatingStatus,
    reload,
    setFilters,
    changePage,
    changeLimit,
    openOrderDetail,
    closeOrderDetail,
    updateOrderStatus,
  };
}

function detailToListItem(detail: OrderDetail): OrderListItem {
  return {
    id: detail.id,
    orderNumber: detail.orderNumber,
    channel: detail.channel,
    customerName: detail.customer?.name,
    status: detail.status,
    total: detail.totals.total,
    paymentStatus: detail.paymentSummary?.status ?? 'UNPAID',
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    statusUpdatedAt: detail.statusUpdatedAt,
    elapsedMinutes: detail.elapsedMinutes,
    isDelayed: detail.isDelayed,
    delayLevel: detail.delayLevel,
  };
}

function upsertListItem(current: OrderListItem[], updated: OrderListItem) {
  const exists = current.some((item) => item.id === updated.id);
  const next = exists ? current.map((item) => (item.id === updated.id ? updated : item)) : [updated, ...current];
  return next.sort((a, b) => Number(b.isDelayed) - Number(a.isDelayed) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
