import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '../common/request-context';
import { OrderPrismaRepository, type FindManyOrdersFilters } from './order.prisma';
import { OrdersEventsService } from './orders-events.service';

const ALLOWED_ORDER_STATUSES = [
  'DRAFT',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'IN_PREPARATION',
  'READY',
  'WAITING_PICKUP',
  'WAITING_DISPATCH',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FINALIZED',
  'CANCELED',
  'REFUNDED',
] as const;

const ACTIVE_ORDER_STATUSES = [
  'DRAFT',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'IN_PREPARATION',
  'READY',
  'WAITING_PICKUP',
  'WAITING_DISPATCH',
  'OUT_FOR_DELIVERY',
] as const;

const DELAYED_AFTER_MINUTES = 10;
const URGENT_AFTER_MINUTES = 20;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

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
  timeline: Array<{
    type: string;
    label: string;
    status: string;
    message: string;
    createdAt: string;
    at: string;
    actor: {
      role: string;
      name: string;
    };
  }>;
  timelineSource: 'events' | 'fallback';
}

export interface OrderListItemDto {
  id: string;
  orderNumber: string;
  channel?: string;
  customerName?: string;
  status: string;
  total: number;
  paymentStatus: string;
  createdAt: string;
  updatedAt?: string;
  statusUpdatedAt?: string;
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

export interface OrderSummaryDto {
  totalOrders: number;
  activeOrders: number;
  delayedOrders: number;
  preparingOrders: number;
  readyOrders: number;
  canceledOrders: number;
  grossRevenue: number;
  netRevenue: number;
  canceledRevenue: number;
  averageTicket: number;
  ordersByChannel: Record<string, number>;
  ordersByStatus: Record<string, number>;
  paymentsByStatus: Record<string, number>;
  dateFrom: string;
  dateTo: string;
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
  ) {}

  async getById(id: string, ctx: RequestContext): Promise<OrderReadDto> {
    const order = await this.orderRepository.findById(id, ctx);
    if (!order) {
      throw new NotFoundException(`Pedido '${id}' nao encontrado para a empresa atual.`);
    }

    return this.toOrderReadDto(order);
  }

  async getTrackingById(id: string, ctx: RequestContext): Promise<OrderTrackingDto> {
    const order = await this.orderRepository.findById(id, ctx);
    if (!order) {
      throw new NotFoundException(`Pedido '${id}' nao encontrado para a empresa atual.`);
    }
    return this.toTrackingDto(order, 'tenant_header');
  }

  async getPublicTrackingByToken(token: string): Promise<OrderTrackingDto> {
    const normalized = String(token ?? '').trim();
    if (!normalized || normalized.length < 32) {
      throw new NotFoundException('Tracking nao encontrado.');
    }
    const order = await this.orderRepository.findByPublicTrackingToken(normalized);
    if (!order) {
      throw new NotFoundException('Tracking nao encontrado.');
    }
    return this.toTrackingDto(order, 'public_token');
  }

  private toTrackingDto(order: any, trackingSecurity: OrderTrackingDto['trackingSecurity']): OrderTrackingDto {
    const timeline = this.buildTimeline(order).map((event) => ({
      status: event.status,
      message: this.publicTimelineMessage(event.status, event.message),
      createdAt: event.createdAt,
    }));
    const durationSeconds = Number(order.deliveryDurationSec ?? 0);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      timeline,
      estimatedMinutes: durationSeconds > 0 ? Math.ceil(durationSeconds / 60) : undefined,
      deliveryDistanceMeters: Number(order.deliveryDistanceMeters ?? 0),
      deliveryFee: Number(order.deliveryFee ?? 0),
      total: Number(order.totalAmount ?? 0),
      trackingSecurity,
    };
  }

  async summary(
    ctx: RequestContext,
    query: { dateFrom?: string; dateTo?: string; channel?: string },
  ): Promise<OrderSummaryDto> {
    const range = this.resolveSummaryRange(query.dateFrom, query.dateTo);
    const result = await this.orderRepository.summary(ctx, {
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      channel: query.channel,
    });

    return {
      totalOrders: result.totalOrders,
      activeOrders: result.activeOrders,
      delayedOrders: result.delayedOrders,
      preparingOrders: result.preparingOrders,
      readyOrders: result.readyOrders,
      canceledOrders: result.canceledOrders,
      grossRevenue: roundMoney(result.grossRevenue),
      netRevenue: roundMoney(result.netRevenue),
      canceledRevenue: roundMoney(result.canceledRevenue),
      averageTicket: roundMoney(result.averageTicket),
      ordersByChannel: result.ordersByChannel,
      ordersByStatus: result.ordersByStatus,
      paymentsByStatus: result.paymentsByStatus,
      dateFrom: result.dateFrom,
      dateTo: result.dateTo,
    };
  }

  async updateStatus(
    id: string,
    status: string,
    ctx: RequestContext,
    options?: { emitEvent?: boolean },
  ): Promise<OrderReadDto> {
    if (!ALLOWED_ORDER_STATUSES.includes(status as (typeof ALLOWED_ORDER_STATUSES)[number])) {
      throw new BadRequestException(`Status invÃ¡lido: '${status}'.`);
    }

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

    return this.toOrderReadDto(order);
  }

  private toOrderReadDto(order: any): OrderReadDto {
    const snapshot = this.readCheckoutSnapshot(order.internalNotes);
    const elapsedMinutes = this.elapsedMinutes(order.createdAt);
    const delayLevel = this.delayLevel(order.status, elapsedMinutes);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      channel: this.resolveBusinessChannel(order),
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
      updatedAt: order.updatedAt ? order.updatedAt.toISOString() : undefined,
      statusUpdatedAt: order.updatedAt ? order.updatedAt.toISOString() : undefined,
      elapsedMinutes,
      isDelayed: delayLevel !== 'none',
      delayLevel,
      preparationStartedAt: order.preparationStartedAt ? order.preparationStartedAt.toISOString() : undefined,
      readyAt: order.readyAt ? order.readyAt.toISOString() : undefined,
      timeline: this.buildTimeline(order),
      timelineSource: this.resolveTimelineSource(order),
    };
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
    const parsed = this.readInternalNotes(internalNotes);
    return parsed?.checkoutSnapshot as
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
      | undefined;
  }

  private resolveBusinessChannel(order: any): string | undefined {
    const channel = order.channel ? String(order.channel) : undefined;
    const internalNotes = this.readInternalNotes(order.internalNotes);
    if ((channel === 'QR' && internalNotes?.sourceChannel === 'waiter_app') || channel === 'WAITER_APP') {
      return 'waiter_app';
    }
    return channel;
  }

  private readInternalNotes(internalNotes: unknown): Record<string, unknown> | undefined {
    if (typeof internalNotes !== 'string' || !internalNotes.trim()) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(internalNotes);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
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
      activeOnly?: string | boolean;
      delayedOnly?: string | boolean;
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
    const createdFrom = query.createdFrom ? new Date(query.createdFrom) : undefined;
    const createdTo = query.createdTo ? new Date(query.createdTo) : undefined;

    const filters: FindManyOrdersFilters = {
      status: query.status,
      channel: query.channel,
      paymentStatus: query.paymentStatus,
      activeOnly: this.parseBoolean(query.activeOnly),
      delayedOnly: this.parseBoolean(query.delayedOnly),
      search: query.search,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      page,
      limit,
      createdFrom,
      createdTo,
    };

    const result = await this.orderRepository.findMany(ctx, filters);
    const data: OrderListItemDto[] = result.rows.map((order) => this.toOrderListItemDto(order));

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

  private toOrderListItemDto(order: any): OrderListItemDto {
    const snapshot = this.readCheckoutSnapshot(order.internalNotes);
    const elapsedMinutes = this.elapsedMinutes(order.createdAt);
    const delayLevel = this.delayLevel(order.status, elapsedMinutes);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      channel: this.resolveBusinessChannel(order),
      customerName: snapshot?.customer?.name,
      status: order.status,
      total: Number(order.totalAmount),
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt ? order.updatedAt.toISOString() : undefined,
      statusUpdatedAt: order.updatedAt ? order.updatedAt.toISOString() : undefined,
      elapsedMinutes,
      isDelayed: delayLevel !== 'none',
      delayLevel,
    };
  }

  private elapsedMinutes(createdAt: Date): number {
    return Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60_000));
  }

  private delayLevel(status: string, elapsedMinutes: number): 'none' | 'attention' | 'urgent' {
    if (!ACTIVE_ORDER_STATUSES.includes(status as (typeof ACTIVE_ORDER_STATUSES)[number])) {
      return 'none';
    }
    if (elapsedMinutes >= URGENT_AFTER_MINUTES) {
      return 'urgent';
    }
    if (elapsedMinutes >= DELAYED_AFTER_MINUTES) {
      return 'attention';
    }
    return 'none';
  }

  private buildTimeline(order: any): OrderReadDto['timeline'] {
    if (Array.isArray(order.timelineEvents) && order.timelineEvents.length > 0) {
      return order.timelineEvents.map((event: any) => this.mapTimelineEvent(event));
    }

    const timeline: OrderReadDto['timeline'] = [
      this.fallbackTimelineEvent('order_created', 'Pedido criado', order.status ?? 'CREATED', order.createdAt),
    ];
    if (order.confirmedAt) {
      timeline.push(this.fallbackTimelineEvent('status_changed', 'Confirmado', 'CONFIRMED', order.confirmedAt));
    }
    if (order.preparationStartedAt) {
      timeline.push(this.fallbackTimelineEvent('status_changed', 'Em preparo', 'IN_PREPARATION', order.preparationStartedAt));
    }
    if (order.readyAt) {
      timeline.push(this.fallbackTimelineEvent('status_changed', 'Pronto', 'READY', order.readyAt));
    }
    if (order.dispatchedAt) {
      timeline.push(this.fallbackTimelineEvent('status_changed', 'Saiu para entrega', 'OUT_FOR_DELIVERY', order.dispatchedAt));
    }
    if (order.deliveredAt) {
      timeline.push(this.fallbackTimelineEvent('status_changed', 'Entregue', 'DELIVERED', order.deliveredAt));
    }
    if (order.finalizedAt) {
      timeline.push(this.fallbackTimelineEvent('status_changed', 'Finalizado', 'FINALIZED', order.finalizedAt));
    }
    if (order.canceledAt) {
      timeline.push(this.fallbackTimelineEvent('status_changed', 'Cancelado', 'CANCELED', order.canceledAt));
    }
    return timeline;
  }

  private resolveTimelineSource(order: any): OrderReadDto['timelineSource'] {
    return Array.isArray(order.timelineEvents) && order.timelineEvents.length > 0 ? 'events' : 'fallback';
  }

  private mapTimelineEvent(event: any): OrderReadDto['timeline'][number] {
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    const status = String(payload.status ?? event.newStatus ?? event.previousStatus ?? event.eventType);
    const message = String(payload.message ?? this.timelineMessage(event.eventType, status));
    const actor = payload.actor && typeof payload.actor === 'object'
      ? {
          role: String(payload.actor.role ?? this.actorRoleFromType(event.actorType)),
          name: String(payload.actor.name ?? this.actorNameFromType(event.actorType)),
        }
      : {
          role: this.actorRoleFromType(event.actorType),
          name: this.actorNameFromType(event.actorType),
        };
    const createdAt = event.createdAt.toISOString();
    return {
      type: String(payload.type ?? event.eventType),
      label: message,
      status,
      message,
      createdAt,
      at: createdAt,
      actor,
    };
  }

  private fallbackTimelineEvent(type: string, message: string, status: string, date: Date): OrderReadDto['timeline'][number] {
    const createdAt = date.toISOString();
    return {
      type,
      label: message,
      status,
      message,
      createdAt,
      at: createdAt,
      actor: { role: 'system', name: 'Sistema' },
    };
  }

  private timelineMessage(type: string, status: string) {
    if (type === 'order_created') return 'Pedido criado';
    if (type === 'payment_updated') return `Pagamento atualizado: ${status}`;
    if (type === 'status_changed') return `Pedido marcado como ${status}`;
    return type;
  }

  private publicTimelineMessage(status: string, fallback: string): string {
    if (status === 'PENDING_CONFIRMATION' || status === 'CONFIRMED') return 'Pedido recebido';
    if (status === 'IN_PREPARATION') return 'Em preparo';
    if (status === 'READY' || status === 'WAITING_PICKUP' || status === 'WAITING_DISPATCH') return 'Pronto';
    if (status === 'OUT_FOR_DELIVERY') return 'Saiu para entrega';
    if (status === 'DELIVERED' || status === 'FINALIZED') return 'Entregue';
    if (status === 'CANCELED') return 'Pedido cancelado';
    if (status === 'REFUNDED') return 'Pedido estornado';
    return fallback;
  }

  private actorRoleFromType(type?: string) {
    if (type === 'INTEGRATION') return 'system';
    if (type === 'USER') return 'admin';
    return 'system';
  }

  private actorNameFromType(type?: string) {
    if (type === 'USER') return 'Usuario';
    return 'Sistema';
  }

  private resolveSummaryRange(dateFrom?: string, dateTo?: string) {
    const now = new Date();
    const start = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = dateTo ? new Date(dateTo) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return {
      dateFrom: Number.isNaN(start.getTime()) ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0) : start,
      dateTo: Number.isNaN(end.getTime()) ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999) : end,
    };
  }

  private parseBoolean(value?: string | boolean): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (value === undefined) return undefined;
    return value === 'true' || value === '1';
  }
}

