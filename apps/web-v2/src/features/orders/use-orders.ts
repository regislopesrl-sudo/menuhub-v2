'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getOrderById,
  listOrders,
  patchOrderStatus,
  type OrderDetail,
  type OrderListItem,
  type OrdersHeaders,
  type OrdersListResponse,
} from './orders.api';
import { connectOrdersSocket, type OrdersEventPayload, type SocketConnectionStatus } from './orders.socket';

export interface OrdersFilters {
  status?: string;
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

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const socket = connectOrdersSocket({
      headers: stableHeaders,
      onConnectionStatus: setSocketStatus,
      onEvent: (event: OrdersEventPayload) => {
        void loadOrders();
        if (selectedOrderIdRef.current && selectedOrderIdRef.current === event.orderId) {
          void loadOrderDetail(event.orderId);
        }
      },
    });

    return () => {
      socket.disconnect();
      setSocketStatus('disconnected');
    };
  }, [loadOrderDetail, loadOrders, stableHeaders]);

  const reload = useCallback(async () => {
    await loadOrders();
    if (selectedOrderIdRef.current) {
      await loadOrderDetail(selectedOrderIdRef.current);
    }
  }, [loadOrderDetail, loadOrders]);

  const setFilters = useCallback((next: OrdersFilters) => {
    setFiltersState(next);
    const reset = { ...pagination, page: 1 };
    setPagination(reset);
    void loadOrders(reset, next);
  }, [loadOrders, pagination]);

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
        await loadOrders();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao atualizar status do pedido.';
        setError(message);
        setDetailError(message);
      } finally {
        setIsUpdatingStatus(null);
      }
    },
    [loadOrders, stableHeaders],
  );

  return {
    orders,
    loading,
    error,
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
