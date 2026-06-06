import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import type { RequestContext } from '../common/request-context';
import { OrderPrismaRepository, type FindManyOrdersFilters } from './order.prisma';
import { OrdersEventsService } from './orders-events.service';
import { StockService } from '../stock/stock.service';
import { assertCanCancelOrder, assertCanTransitionOrderStatus } from './orders-status.policy';
import { AUDIT_ACTIONS } from '../common/audit-log';
import { recordAuditFromContext } from '../common/audit-log-recorder';

export interface OrderReadDto {
  id: string;
  orderNumber: string;
  channel?: string;
  status: string;
  totals: {
    subtotal: number;
    discount: number;
    deliveryFee: number;
    total: number;
  };
  deliveryFee: number;
  customer?: {
    name: string;
    phone: string;
  };
  deliveryAddress?: {
    street: string;
    number: string;
    neighborhood: string;
    city?: string;
    reference?: string;
  };
  items: Array<{
    id: string;
    productId?: string | null;
    station?: string | null;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    selectedOptions?: Array<{
      optionId?: string | null;
      name: string;
      price: number;
      quantity: number;
    }>;
  }>;
  paymentSummary?: {
    status: string;
    paidAmount: number;
    refundedAmount: number;
  };
  createdAt: string;
  updatedAt?: string;
  statusUpdatedAt?: string;
  elapsedMinutes: number;
  isDelayed: boolean;
  delayLevel: 'none' | 'attention' | 'urgent';
  preparationStartedAt?: string;
  readyAt?: string;
  timeline?: Array<{
    type: string;
    label: string;
    status: string;
    message: string;
    createdAt: string;
    at: string;
    actor: { role: string; name: string };
  }>;
  timelineSource?: 'events' | 'fallback';
}

export interface OrderListItemDto {
  id: string;
  orderNumber: string;
  channel?: string;
  status: string;
  total: number;
  paymentStatus: string;
  createdAt: string;
  updatedAt?: string;
  statusUpdatedAt?: string;
  customerName?: string;
  elapsedMinutes: number;
  isDelayed: boolean;
  delayLevel: 'none' | 'attention' | 'urgent';
}

export interface OrderListResponseDto {
  data: OrderListItemDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface OrderTrackingDto {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  timeline: Array<{
    status: string;
    message: string;
    createdAt: string;
  }>;
  estimatedMinutes?: number;
  deliveryDistanceMeters: number;
  deliveryFee: number;
  total: number;
  trackingSecurity: 'tenant_header' | 'public_token';
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly orderRepository: OrderPrismaRepository,
    private readonly ordersEvents: OrdersEventsService,
    private readonly stockService: StockService,
  ) {}

  async getById(id: string, ctx: RequestContext): Promise<OrderReadDto> {
    const order = await this.orderRepository.findById(id, ctx);
    if (!order) {
      throw new NotFoundException(`Pedido '${id}' nao encontrado para a empresa atual.`);
    }

    const timeline = await this.orderRepository.listTimeline(id, ctx);
    return this.toOrderReadDto(order, Array.isArray(timeline) ? timeline : undefined);
  }

  async updateStatus(
    id: string,
    status: string,
    ctx: RequestContext,
    options?: { emitEvent?: boolean },
  ): Promise<OrderReadDto> {
    if (!Object.values(OrderStatus).includes(status as OrderStatus)) {
      throw new BadRequestException(`Status inválido: '${status}'.`);
    }

    const current = await this.orderRepository.findById(id, ctx);
    if (!current) {
      throw new NotFoundException(`Pedido '${id}' nao encontrado para a empresa atual.`);
    }
    assertCanTransitionOrderStatus(current.status, status);

    const order = await this.orderRepository.updateStatus(id, status, ctx);
    if (!order) {
      throw new NotFoundException(`Pedido '${id}' nao encontrado para a empresa atual.`);
    }

    if (options?.emitEvent !== false) {
      try {
        await this.ordersEvents.emitOrderStatusUpdated(
          {
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
          },
          ctx,
        );
      } catch {
        // emitter non-blocking by design
      }
    }

    if (this.shouldConsumeStockOnStatus(status)) {
      try {
        await this.stockService.consumeByOrder(ctx, order.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha desconhecida na baixa automatica de estoque.';
        try {
          await this.orderRepository.addInternalNote(order.id, ctx, `Falha na baixa automatica de estoque: ${message}`);
        } catch {
          // audit note is best effort; status update must not be reverted by note failure
        }
      }
    }

    recordAuditFromContext({
      action: AUDIT_ACTIONS.ORDER_STATUS_UPDATE,
      outcome: 'success',
      ctx,
      target: { type: 'order', id: order.id, label: order.orderNumber },
      metadata: { previousStatus: current.status, newStatus: order.status, channel: order.channel },
    });

    return this.toOrderReadDto(order);
  }

  async getTimeline(id: string, ctx: RequestContext) {
    return this.orderRepository.listTimeline(id, ctx);
  }

  async getTrackingById(id: string, ctx: RequestContext): Promise<OrderTrackingDto> {
    const order = await this.orderRepository.findById(id, ctx);
    if (!order) {
      throw new NotFoundException(`Pedido '${id}' nao encontrado para a empresa atual.`);
    }
    const timeline = await this.orderRepository.listTimeline(id, ctx);
    return this.toOrderTrackingDto(order, Array.isArray(timeline) ? timeline : undefined, 'tenant_header');
  }

  async getPublicTrackingByToken(token: string): Promise<OrderTrackingDto> {
    const normalized = String(token ?? '').trim();
    if (!normalized) {
      throw new BadRequestException('trackingToken obrigatorio.');
    }
    const order = await this.orderRepository.findByPublicTrackingToken(normalized);
    if (!order) {
      throw new NotFoundException('Pedido nao encontrado para o token informado.');
    }
    return this.toOrderTrackingDto(order, (order as any).timelineEvents, 'public_token');
  }

  async cancelOrder(
    id: string,
    input: { reasonCode: string; reasonText?: string; internalNote?: string },
    ctx: RequestContext,
  ): Promise<OrderReadDto> {
    const reasonCode = String(input.reasonCode ?? '').trim();
    if (!reasonCode) throw new BadRequestException('reasonCode obrigatorio para cancelamento.');
    const current = await this.orderRepository.findById(id, ctx);
    if (!current) throw new NotFoundException(`Pedido '${id}' nao encontrado para a empresa atual.`);
    assertCanCancelOrder(current.status);
    const order = await this.orderRepository.cancelOrder(id, ctx, {
      reasonCode,
      reasonText: input.reasonText,
      internalNote: input.internalNote,
    });
    if (!order) throw new NotFoundException(`Pedido '${id}' nao encontrado para a empresa atual.`);

    try {
      await this.stockService.releaseOrderConsumption(ctx, order.id, {
        reasonCode: 'order_canceled',
        notes: input.reasonText ?? input.internalNote ?? 'Pedido cancelado.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida na recomposicao de estoque.';
      try {
        await this.orderRepository.addInternalNote(order.id, ctx, `Falha na recomposicao automatica de estoque: ${message}`);
      } catch {
        // audit note is best effort; cancellation must not be reverted by note failure
      }
    }

    recordAuditFromContext({
      action: AUDIT_ACTIONS.ORDER_CANCEL,
      outcome: 'success',
      ctx,
      target: { type: 'order', id: order.id, label: order.orderNumber },
      metadata: { previousStatus: current.status, reasonCode, hasReasonText: Boolean(input.reasonText) },
    });
    return this.toOrderReadDto(order);
  }

  async addInternalNote(id: string, note: string, ctx: RequestContext): Promise<OrderReadDto> {
    const text = String(note ?? '').trim();
    if (!text) throw new BadRequestException('note obrigatoria.');
    const order = await this.orderRepository.addInternalNote(id, ctx, text);
    if (!order) throw new NotFoundException(`Pedido '${id}' nao encontrado para a empresa atual.`);
    recordAuditFromContext({
      action: AUDIT_ACTIONS.ORDER_INTERNAL_NOTE_ADD,
      outcome: 'success',
      ctx,
      target: { type: 'order', id: order.id, label: order.orderNumber },
      metadata: { noteLength: text.length },
    });
    return this.toOrderReadDto(order);
  }

  async refundMock(
    id: string,
    input: { amount: number; reasonCode: string; reasonText?: string },
    ctx: RequestContext,
  ): Promise<OrderReadDto> {
    const amount = Number(input.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('amount deve ser maior que zero.');
    const reasonCode = String(input.reasonCode ?? '').trim();
    if (!reasonCode) throw new BadRequestException('reasonCode obrigatorio para reembolso.');
    let order: any;
    try {
      order = await this.orderRepository.applyRefundMock(id, ctx, { amount, reasonCode, reasonText: input.reasonText });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao processar reembolso.';
      throw new BadRequestException(message);
    }
    if (!order) throw new NotFoundException(`Pedido '${id}' nao encontrado para a empresa atual.`);
    recordAuditFromContext({
      action: AUDIT_ACTIONS.ORDER_REFUND_MOCK,
      outcome: 'success',
      ctx,
      target: { type: 'order', id: order.id, label: order.orderNumber },
      metadata: { amount, reasonCode, reasonText: input.reasonText },
    });
    return this.toOrderReadDto(order);
  }

  private shouldConsumeStockOnStatus(status: string): boolean {
    return (
      status === 'IN_PREPARATION' ||
      status === 'READY' ||
      status === 'OUT_FOR_DELIVERY' ||
      status === 'DELIVERED' ||
      status === 'FINALIZED'
    );
  }

  private toOrderReadDto(order: any, timelineRows?: any[]): OrderReadDto {
    const snapshot = this.readCheckoutSnapshot(order.internalNotes);
    const timing = this.buildTiming(order);
    const timeline = timelineRows?.length
      ? timelineRows.map((event) => this.toTimelineDto(event))
      : this.buildFallbackTimeline(order);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      status: order.status,
      totals: {
        subtotal: Number(order.subtotal),
        discount: Number(order.discountAmount),
        deliveryFee: Number(order.deliveryFee),
        total: Number(order.totalAmount),
      },
      deliveryFee: Number(order.deliveryFee),
      customer: snapshot?.customer,
      deliveryAddress: snapshot?.deliveryAddress,
      items: order.items.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        station: item.station ?? undefined,
        name: item.productNameSnapshot,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        selectedOptions: (item.addons ?? []).map((addon: any) => ({
          optionId: addon.addonItemId,
          name: addon.nameSnapshot,
          price: Number(addon.priceSnapshot),
          quantity: Number(addon.quantity),
        })),
      })),
      paymentSummary: {
        status: order.paymentStatus,
        paidAmount: Number(order.paidAmount),
        refundedAmount: Number(order.refundedAmount),
      },
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt?.toISOString?.(),
      statusUpdatedAt: this.resolveStatusUpdatedAt(order),
      elapsedMinutes: timing.elapsedMinutes,
      isDelayed: timing.isDelayed,
      delayLevel: timing.delayLevel,
      preparationStartedAt: order.preparationStartedAt ? order.preparationStartedAt.toISOString() : undefined,
      readyAt: order.readyAt ? order.readyAt.toISOString() : undefined,
      timeline,
      timelineSource: timelineRows?.length ? 'events' : 'fallback',
    };
  }

  private toOrderTrackingDto(
    order: any,
    timelineRows: any[] | undefined,
    trackingSecurity: OrderTrackingDto['trackingSecurity'],
  ): OrderTrackingDto {
    const timeline = (timelineRows?.length ? timelineRows : this.buildFallbackTimeline(order)).map((event: any) => ({
      status: String(event.newStatus ?? event.status ?? event.eventType ?? 'UNKNOWN'),
      message: String(event.reasonText ?? event.message ?? this.timelineLabel(String(event.eventType ?? event.status ?? 'UNKNOWN'))),
      createdAt: this.toIsoString(event.createdAt ?? event.at ?? order.createdAt),
    }));

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      timeline,
      estimatedMinutes: this.resolveEstimatedMinutes(order),
      deliveryDistanceMeters: Number(order.deliveryDistanceMeters ?? 0),
      deliveryFee: Number(order.deliveryFee ?? 0),
      total: Number(order.totalAmount ?? 0),
      trackingSecurity,
    };
  }

  private resolveEstimatedMinutes(order: any): number | undefined {
    const duration = Number(order.deliveryDurationSec ?? 0);
    if (Number.isFinite(duration) && duration > 0) {
      return Math.ceil(duration / 60);
    }
    return undefined;
  }

  private toIsoString(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    const parsed = new Date(String(value ?? Date.now()));
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  private readCheckoutSnapshot(internalNotes: unknown):
    | {
        customer?: { name: string; phone: string };
        deliveryAddress?: {
          street: string;
          number: string;
          neighborhood: string;
          city?: string;
          reference?: string;
        };
      }
    | undefined {
    if (typeof internalNotes !== 'string' || !internalNotes.trim()) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(internalNotes) as {
        checkoutSnapshot?: {
          customer?: { name: string; phone: string };
          deliveryAddress?: {
            street: string;
            number: string;
            neighborhood: string;
            city?: string;
            reference?: string;
          };
        };
      };
      return parsed.checkoutSnapshot;
    } catch {
      return undefined;
    }
  }

  async list(
    ctx: RequestContext,
    query: {
      status?: string;
      channel?: string;
      paymentStatus?: string;
      activeOnly?: boolean;
      closedOnly?: boolean;
      delayedOnly?: boolean;
      search?: string;
      sortBy?: 'createdAt' | 'updatedAt' | 'total' | 'status';
      sortDirection?: 'asc' | 'desc';
      page?: number;
      limit?: number;
      createdFrom?: string;
      createdTo?: string;
    },
  ): Promise<OrderListResponseDto> {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20) || 20));
    const createdFrom = query.createdFrom ? this.parseDateBoundary(query.createdFrom, 'start') : undefined;
    const createdTo = query.createdTo ? this.parseDateBoundary(query.createdTo, 'end') : undefined;

    const filters: FindManyOrdersFilters = {
      status: query.status,
      channel: query.channel,
      paymentStatus: query.paymentStatus,
      activeOnly: query.activeOnly,
      closedOnly: query.closedOnly,
      delayedOnly: query.delayedOnly,
      search: query.search,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      page,
      limit,
      createdFrom,
      createdTo,
    };

    const result = await this.orderRepository.findMany(ctx, filters);
    const data: OrderListItemDto[] = result.rows.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      customerName: this.readCheckoutSnapshot((order as any).internalNotes)?.customer?.name,
      status: order.status,
      total: Number(order.totalAmount),
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt.toISOString(),
      updatedAt: (order as any).updatedAt?.toISOString?.(),
      statusUpdatedAt: this.resolveStatusUpdatedAt(order),
      ...this.buildTiming(order),
    }));

    const totalPages = Math.max(1, Math.ceil(result.total / limit));
    return {
      data,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages,
      },
    };
  }

  async summary(
    ctx: RequestContext,
    query: { dateFrom?: string; dateTo?: string; channel?: string },
  ) {
    const createdFrom = query.dateFrom ? this.parseDateBoundary(query.dateFrom, 'start') : new Date(new Date().setHours(0, 0, 0, 0));
    const createdTo = query.dateTo ? this.parseDateBoundary(query.dateTo, 'end') : new Date();
    const result = await this.orderRepository.findMany(ctx, {
      page: 1,
      limit: 100,
      createdFrom,
      createdTo,
      channel: query.channel,
      sortBy: 'createdAt',
      sortDirection: 'desc',
    });
    const rows = result.rows;
    const activeStatuses = ['DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PREPARATION', 'READY', 'WAITING_PICKUP', 'WAITING_DISPATCH', 'OUT_FOR_DELIVERY'];
    const totalOrders = result.total;
    const activeOrders = rows.filter((row) => activeStatuses.includes(row.status)).length;
    const delayedOrders = rows.filter((row) => this.buildTiming(row).isDelayed).length;
    const preparingOrders = rows.filter((row) => row.status === 'IN_PREPARATION').length;
    const readyOrders = rows.filter((row) => ['READY', 'WAITING_PICKUP', 'WAITING_DISPATCH'].includes(row.status)).length;
    const canceledOrders = rows.filter((row) => row.status === 'CANCELED').length;
    const grossRevenue = rows.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0);
    const canceledRevenue = rows
      .filter((row) => ['CANCELED', 'REFUNDED'].includes(row.status) || ['CANCELED', 'REFUNDED'].includes(row.paymentStatus))
      .reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0);
    const netRevenue = Math.max(0, grossRevenue - canceledRevenue);

    return {
      totalOrders,
      activeOrders,
      delayedOrders,
      preparingOrders,
      readyOrders,
      canceledOrders,
      grossRevenue,
      netRevenue,
      canceledRevenue,
      averageTicket: totalOrders > 0 ? Number((netRevenue / totalOrders).toFixed(2)) : 0,
      ordersByChannel: this.countBy(rows, 'channel'),
      ordersByStatus: this.countBy(rows, 'status'),
      paymentsByStatus: this.countBy(rows, 'paymentStatus'),
      dateFrom: createdFrom.toISOString(),
      dateTo: createdTo.toISOString(),
    };
  }

  private buildTiming(order: any) {
    const createdAt = order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt);
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60000));
    const activeDelayed = ['DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PREPARATION'].includes(order.status);
    const delayLevel = activeDelayed && elapsedMinutes >= 45 ? 'urgent' : activeDelayed && elapsedMinutes >= 25 ? 'attention' : 'none';
    return { elapsedMinutes, isDelayed: delayLevel !== 'none', delayLevel } as const;
  }

  private parseDateBoundary(value: string, boundary: 'start' | 'end') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Data invalida: '${value}'.`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      if (boundary === 'start') parsed.setHours(0, 0, 0, 0);
      if (boundary === 'end') parsed.setHours(23, 59, 59, 999);
    }
    return parsed;
  }

  private resolveStatusUpdatedAt(order: any) {
    const candidates = [
      order.finalizedAt,
      order.deliveredAt,
      order.dispatchedAt,
      order.readyAt,
      order.preparationStartedAt,
      order.confirmedAt,
      order.canceledAt,
      order.updatedAt,
    ].filter(Boolean);
    return candidates[0]?.toISOString?.();
  }

  private toTimelineDto(event: any) {
    const status = event.newStatus ?? event.previousStatus ?? event.eventType;
    return {
      type: event.eventType,
      label: this.timelineLabel(event.eventType),
      status,
      message: event.reasonText ?? this.timelineLabel(event.eventType),
      createdAt: event.createdAt.toISOString(),
      at: event.createdAt.toISOString(),
      actor: { role: String(event.actorType ?? 'SYSTEM'), name: event.actorUserId ?? 'Sistema' },
    };
  }

  private buildFallbackTimeline(order: any) {
    return [
      { status: 'CREATED', at: order.createdAt },
      order.confirmedAt ? { status: 'CONFIRMED', at: order.confirmedAt } : null,
      order.preparationStartedAt ? { status: 'IN_PREPARATION', at: order.preparationStartedAt } : null,
      order.readyAt ? { status: 'READY', at: order.readyAt } : null,
      order.dispatchedAt ? { status: 'OUT_FOR_DELIVERY', at: order.dispatchedAt } : null,
      order.deliveredAt ? { status: 'DELIVERED', at: order.deliveredAt } : null,
      order.finalizedAt ? { status: 'FINALIZED', at: order.finalizedAt } : null,
      order.canceledAt ? { status: 'CANCELED', at: order.canceledAt } : null,
    ].filter(Boolean).map((row: any) => ({
      type: 'order.timeline.fallback',
      label: row.status,
      status: row.status,
      message: row.status,
      createdAt: row.at.toISOString(),
      at: row.at.toISOString(),
      actor: { role: 'SYSTEM', name: 'Sistema' },
    }));
  }

  private timelineLabel(type: string) {
    if (type === 'order.status.updated') return 'Status atualizado';
    if (type === 'order.canceled') return 'Pedido cancelado';
    if (type === 'order.internal_note.added') return 'Observacao interna';
    if (type === 'order.refund.mock') return 'Reembolso mock';
    return type;
  }

  private countBy(rows: any[], key: string) {
    return rows.reduce<Record<string, number>>((acc, row) => {
      const value = String(row[key] ?? 'UNKNOWN');
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});
  }
}
