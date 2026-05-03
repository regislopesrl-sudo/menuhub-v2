import { Injectable } from '@nestjs/common';
import type { CheckoutResult } from '@delivery-futuro/order-core';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../database/prisma.service';
import type { DeliveryQuoteResponse } from '../delivery/dto/delivery-quote.dto';
import type { PaymentIntent } from '../payments/providers/payment-provider.interface';

export interface FindManyOrdersFilters {
  status?: string;
  channel?: string;
  paymentStatus?: string;
  activeOnly?: boolean;
  delayedOnly?: boolean;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'total' | 'status';
  sortDirection?: 'asc' | 'desc';
  page: number;
  limit: number;
  createdFrom?: Date;
  createdTo?: Date;
}

export interface OrderSummaryFilters {
  dateFrom: Date;
  dateTo: Date;
  channel?: string;
}

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
const REVENUE_EXCLUDED_ORDER_STATUSES = ['CANCELED', 'REFUNDED'] as const;
const REVENUE_EXCLUDED_PAYMENT_STATUSES = ['CANCELED', 'REFUNDED'] as const;

type PersistedOrderType = 'DELIVERY' | 'COUNTER' | 'COMMAND' | 'KIOSK';
type PersistedOrderChannel = 'WEB' | 'PDV' | 'KIOSK' | 'QR' | 'WAITER_APP' | 'WHATSAPP';
type PersistedPaymentMethod = 'PIX' | 'CARD' | 'CASH';
type PersistedPaymentStatus =
  | 'PENDING'
  | 'INITIATED'
  | 'AUTHORIZED'
  | 'PAID'
  | 'DECLINED'
  | 'CANCELED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export interface CreateOrderOptions {
  publicTrackingToken?: string;
  pdvSessionId?: string;
  commandId?: string;
  tableId?: string;
  tableSessionId?: string;
}

function normalizeChannel(channel?: string) {
  if (!channel) return undefined;
  const normalized = channel.trim().toUpperCase();
  if (normalized === 'DELIVERY') return 'WEB';
  if (normalized === 'PDV') return 'PDV';
  if (normalized === 'KIOSK') return 'KIOSK';
  if (normalized === 'WHATSAPP') return 'WHATSAPP';
  if (normalized === 'WAITER_APP') return 'WAITER_APP';
  if (normalized === 'WAITER') return 'QR';
  return normalized;
}

function mapResultPersistence(channel: string, options?: CreateOrderOptions): {
  orderType: PersistedOrderType;
  channel: PersistedOrderChannel;
  sourceChannel: string;
} {
  switch (channel) {
    case 'delivery':
      return { orderType: 'DELIVERY', channel: 'WEB', sourceChannel: 'delivery' };
    case 'pdv':
      return { orderType: 'COUNTER', channel: 'PDV', sourceChannel: 'pdv' };
    case 'kiosk':
      return { orderType: 'KIOSK', channel: 'KIOSK', sourceChannel: 'kiosk' };
    case 'whatsapp':
      return { orderType: 'DELIVERY', channel: 'WHATSAPP', sourceChannel: 'whatsapp' };
    case 'waiter_app':
      if (!options?.commandId) {
        throw new Error('waiter_app exige commandId para vincular pedido a uma comanda.');
      }
      return { orderType: 'COMMAND', channel: 'WAITER_APP', sourceChannel: 'waiter_app' };
    default:
      throw new Error(`Canal de pedido nao suportado: ${channel}`);
  }
}

function buildActor(ctx: RequestContext) {
  const role = ctx.channel === 'pdv' ? 'pdv' : ctx.channel === 'waiter_app' ? 'waiter_app' : ctx.userRole ?? 'system';
  return {
    role,
    name: role === 'system' ? 'Sistema' : role,
  };
}

function buildOrderBy(filters: FindManyOrdersFilters) {
  const direction = filters.sortDirection === 'asc' ? ('asc' as const) : ('desc' as const);
  switch (filters.sortBy) {
    case 'updatedAt':
      return { updatedAt: direction };
    case 'total':
      return { totalAmount: direction };
    case 'status':
      return { status: direction };
    case 'createdAt':
    default:
      return { createdAt: direction };
  }
}

@Injectable()
export class OrderPrismaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(
    result: CheckoutResult,
    ctx: RequestContext,
    deliveryQuote?: DeliveryQuoteResponse,
    options?: CreateOrderOptions,
  ) {
    const mappedPersistence = mapResultPersistence(result.order.channel, options);
    const branchId = await this.resolveBranchId(ctx);
    const paymentReason = result.payment.reason ? String(result.payment.reason) : undefined;
    const mappedStatus = this.mapOrderStatus(result.order.status);
    const customerSnapshot = result.order.customer
      ? {
          customer: {
            name: result.order.customer.name,
            phone: result.order.customer.phone,
          },
          deliveryAddress: result.order.deliveryAddress,
        }
      : undefined;

    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.order.create({
          data: {
            companyId: ctx.companyId,
            branchId,
            commandId: options?.commandId ?? null,
            orderNumber: this.buildOrderNumber(),
            orderType: mappedPersistence.orderType,
            channel: mappedPersistence.channel,
            status: mappedStatus,
            paymentStatus: result.payment.status === 'APPROVED' ? 'PAID' : 'UNPAID',
            subtotal: result.order.totals.subtotal,
            discountAmount: result.order.totals.discount,
            deliveryFee: result.order.totals.deliveryFee,
            totalAmount: result.order.totals.total,
            deliveryAreaId: deliveryQuote?.areaId ?? null,
            deliveryDistanceMeters: deliveryQuote?.distanceMeters ?? 0,
            deliveryDurationSec: deliveryQuote?.durationSeconds ?? 0,
            notes: `V2 checkout requestId=${ctx.requestId}`,
            internalNotes: JSON.stringify({
              payment: {
                status: result.payment.status,
                method: result.payment.method,
                reason: paymentReason,
              },
              pdv: options?.pdvSessionId
                ? {
                    sessionId: options.pdvSessionId,
                  }
                : undefined,
              sourceChannel: mappedPersistence.sourceChannel,
              waiter:
                mappedPersistence.sourceChannel === 'waiter_app'
                  ? {
                      commandId: options?.commandId,
                      tableId: options?.tableId,
                      tableSessionId: options?.tableSessionId,
                    }
                  : undefined,
              checkoutSnapshot: customerSnapshot
                ? {
                    ...customerSnapshot,
                    trackingToken: options?.publicTrackingToken,
                  }
                : options?.publicTrackingToken
                  ? { trackingToken: options.publicTrackingToken }
                  : undefined,
              deliveryQuote,
            }),
            publicTrackingToken: options?.publicTrackingToken ?? null,
            items: {
              create: result.order.items.map((item) => ({
                productId: item.productId,
                productNameSnapshot: item.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: Number(
                  (
                    item.quantity *
                    (item.unitPrice +
                      (item.selectedOptions ?? []).reduce((sum, option) => sum + option.price, 0))
                  ).toFixed(2),
                ),
                addons: {
                  create: (item.selectedOptions ?? []).map((option) => ({
                    addonItemId: option.optionId,
                    nameSnapshot: option.name,
                    priceSnapshot: option.price,
                    quantity: 1,
                  })),
                },
              })),
            },
            timelineEvents: {
              create: {
                actorType: 'SYSTEM',
                eventType: 'order_created',
                newStatus: mappedStatus,
                sourceModule: ctx.channel ?? 'checkout',
                sourceAction: 'create_order',
                channel: mappedPersistence.channel,
                correlationId: ctx.requestId,
                payload: {
                  type: 'order_created',
                  status: mappedStatus,
                  message: 'Pedido criado',
                  actor: buildActor(ctx),
                },
              },
            },
          },
          include: {
            items: {
              include: {
                addons: true,
              },
            },
            timelineEvents: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      } catch (error) {
        if (this.isOrderNumberCollision(error)) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    throw new Error('Nao foi possivel gerar orderNumber unico apos 3 tentativas para V2 checkout.');
  }

  async findById(id: string, ctx: RequestContext) {
    return this.prisma.order.findFirst({
      where: {
        id,
        companyId: ctx.companyId,
        ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
      },
      include: {
        items: {
          include: {
            addons: true,
          },
        },
        timelineEvents: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async findByPublicTrackingToken(token: string) {
    return this.prisma.order.findFirst({
      where: {
        OR: [
          { publicTrackingToken: token },
          {
            internalNotes: {
              contains: `"trackingToken":"${token}"`,
            },
          },
        ],
      },
      include: {
        items: {
          include: {
            addons: true,
          },
        },
        timelineEvents: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
  async attachPaymentIntent(orderId: string, intent: PaymentIntent, ctx: RequestContext) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        companyId: ctx.companyId,
        ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
      },
      select: {
        id: true,
        internalNotes: true,
        channel: true,
        totalAmount: true,
      },
    });

    if (!order) {
      return null;
    }

    const snapshot = this.parseInternalNotes(order.internalNotes);
    snapshot.payment = {
      ...((snapshot.payment as Record<string, unknown> | undefined) ?? {}),
      provider: intent.provider,
      providerPaymentId: intent.providerPaymentId,
      status: intent.status,
      method: intent.method,
      expiresAt: 'expiresAt' in intent ? intent.expiresAt : undefined,
      cardBrand: 'cardBrand' in intent ? intent.cardBrand : undefined,
      maskedCard: 'maskedCard' in intent ? intent.maskedCard : undefined,
    };

    return this.prisma.order.update({
      where: { id: order.id },
      data: {
        internalNotes: JSON.stringify(snapshot),
        payments: {
          create: {
            paymentMethod: this.mapPaymentMethod(intent.method),
            amount: order.totalAmount,
            status: this.mapPaymentStatus(intent.status),
            provider: intent.provider,
            providerTransactionId: intent.providerPaymentId,
            requestId: ctx.requestId,
            metadata: {
              provider: intent.provider,
              providerPaymentId: intent.providerPaymentId,
              expiresAt: 'expiresAt' in intent ? intent.expiresAt : undefined,
              cardBrand: 'cardBrand' in intent ? intent.cardBrand : undefined,
              maskedCard: 'maskedCard' in intent ? intent.maskedCard : undefined,
            } as any,
          },
        },
        timelineEvents: {
          create: {
            actorType: 'SYSTEM',
            eventType: 'payment_updated',
            sourceModule: 'payments',
            sourceAction: intent.method === 'PIX' ? 'create_pix_intent' : 'create_card_intent',
            channel: order.channel,
            correlationId: ctx.requestId,
            payload: {
              type: 'payment_updated',
              status: intent.status,
              message: 'Pagamento atualizado',
              actor: { role: 'system', name: 'Sistema' },
              provider: intent.provider,
              providerPaymentId: intent.providerPaymentId,
            },
          },
        },
      },
      select: { id: true },
    });
  }

  async findByProviderPaymentId(providerPaymentId: string) {
    return this.prisma.order.findFirst({
      where: {
        payments: {
          some: {
            providerTransactionId: providerPaymentId,
          },
        },
      },
      include: {
        items: {
          include: {
            addons: true,
          },
        },
      },
    });
  }

  async findByProviderPaymentIdForCompany(providerPaymentId: string, ctx: RequestContext) {
    return this.prisma.order.findFirst({
      where: {
        companyId: ctx.companyId,
        ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
        payments: {
          some: {
            providerTransactionId: providerPaymentId,
          },
        },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
      },
    });
  }

  async applyWebhookPaymentUpdate(input: {
    orderId: string;
    paymentStatus: 'APPROVED' | 'DECLINED' | 'EXPIRED' | 'PENDING' | 'REFUNDED';
    provider: string;
    providerPaymentId: string;
    eventId: string;
  }) {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        status: true,
        internalNotes: true,
        channel: true,
      },
    });
    if (!order) {
      return null;
    }

    const snapshot = this.parseInternalNotes(order.internalNotes);
    snapshot.payment = {
      ...((snapshot.payment as Record<string, unknown> | undefined) ?? {}),
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      status: input.paymentStatus,
      lastWebhookEventId: input.eventId,
      updatedAt: new Date().toISOString(),
    };

    let mappedOrderStatus = order.status;
    let mappedPaymentSummaryStatus: 'PAID' | 'UNPAID' | 'PENDING' | 'REFUNDED' = 'PENDING';
    if (input.paymentStatus === 'APPROVED') {
      mappedOrderStatus = 'CONFIRMED';
      mappedPaymentSummaryStatus = 'PAID';
    } else if (input.paymentStatus === 'DECLINED') {
      mappedOrderStatus = 'PENDING_CONFIRMATION';
      mappedPaymentSummaryStatus = 'UNPAID';
    } else if (input.paymentStatus === 'EXPIRED') {
      mappedPaymentSummaryStatus = 'UNPAID';
    } else if (input.paymentStatus === 'REFUNDED') {
      mappedOrderStatus = 'REFUNDED';
      mappedPaymentSummaryStatus = 'REFUNDED';
    } else {
      mappedPaymentSummaryStatus = 'PENDING';
    }

    const timelineEvents = [
      {
        actorType: 'INTEGRATION' as const,
        eventType: 'payment_updated',
        previousStatus: order.status,
        newStatus: mappedOrderStatus,
        sourceModule: 'payments',
        sourceAction: 'webhook',
        channel: order.channel,
        correlationId: input.eventId,
        payload: {
          type: 'payment_updated',
          status: input.paymentStatus,
          message: `Pagamento atualizado via webhook: ${input.paymentStatus}`,
          actor: { role: 'system', name: 'Sistema' },
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          eventId: input.eventId,
        },
      },
      ...(mappedOrderStatus !== order.status
        ? [
            {
              actorType: 'INTEGRATION' as const,
              eventType: 'status_changed',
              previousStatus: order.status,
              newStatus: mappedOrderStatus,
              sourceModule: 'payments',
              sourceAction: 'webhook_status_sync',
              channel: order.channel,
              correlationId: input.eventId,
              payload: {
                type: 'status_changed',
                status: mappedOrderStatus,
                message: `Status atualizado por pagamento: ${mappedOrderStatus}`,
                actor: { role: 'system', name: 'Sistema' },
              },
            },
          ]
        : []),
    ];

    return this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: mappedOrderStatus,
        paymentStatus: mappedPaymentSummaryStatus,
        internalNotes: JSON.stringify(snapshot),
        payments: {
          updateMany: {
            where: {
              providerTransactionId: input.providerPaymentId,
            },
            data: {
              status: this.mapPaymentStatus(input.paymentStatus),
              provider: input.provider,
              providerTransactionId: input.providerPaymentId,
              ...(input.paymentStatus === 'APPROVED' ? { paidAt: new Date() } : {}),
              ...(input.paymentStatus === 'DECLINED' || input.paymentStatus === 'EXPIRED'
                ? { canceledAt: new Date() }
                : {}),
              ...(input.paymentStatus === 'REFUNDED' ? { refundedAt: new Date() } : {}),
            },
          },
        },
        timelineEvents: {
          create: timelineEvents,
        },
      },
      include: {
        items: {
          include: {
            addons: true,
          },
        },
        timelineEvents: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async findMany(ctx: RequestContext, filters: FindManyOrdersFilters) {
    const statusFilter = filters.delayedOnly || filters.activeOnly ? { in: ACTIVE_ORDER_STATUSES } : filters.status;
    const createdAtFilter = {
      ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
      ...(filters.createdTo ? { lte: filters.createdTo } : {}),
      ...(filters.delayedOnly ? { lte: new Date(Date.now() - DELAYED_AFTER_MINUTES * 60_000) } : {}),
    };
    const channel = normalizeChannel(filters.channel);
    const where: Record<string, unknown> = {
      companyId: ctx.companyId,
      ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(channel ? { channel } : {}),
      ...(filters.paymentStatus ? { paymentStatus: filters.paymentStatus } : {}),
      ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
      ...(filters.search?.trim()
        ? {
            OR: [
              { orderNumber: { contains: filters.search.trim(), mode: 'insensitive' } },
              { internalNotes: { contains: filters.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (filters.page - 1) * filters.limit;
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: buildOrderBy(filters),
        skip,
        take: filters.limit,
      }),
    ]);

    return { total, rows };
  }

  async summary(ctx: RequestContext, filters: OrderSummaryFilters) {
    const channel = normalizeChannel(filters.channel);
    const where: Record<string, unknown> = {
      companyId: ctx.companyId,
      ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
      ...(channel ? { channel } : {}),
      createdAt: {
        gte: filters.dateFrom,
        lte: filters.dateTo,
      },
    };

    const activeWhere = { ...where, status: { in: [...ACTIVE_ORDER_STATUSES] } };
    const delayedWhere = {
      ...activeWhere,
      createdAt: {
        gte: filters.dateFrom,
        lte: new Date(Math.min(filters.dateTo.getTime(), Date.now() - DELAYED_AFTER_MINUTES * 60_000)),
      },
    };

    const netRevenueWhere = {
      ...where,
      status: { notIn: [...REVENUE_EXCLUDED_ORDER_STATUSES] },
      paymentStatus: { notIn: [...REVENUE_EXCLUDED_PAYMENT_STATUSES] },
    };
    const canceledRevenueWhere = {
      ...where,
      OR: [
        { status: { in: [...REVENUE_EXCLUDED_ORDER_STATUSES] } },
        { paymentStatus: { in: [...REVENUE_EXCLUDED_PAYMENT_STATUSES] } },
      ],
    };

    const [
      totalOrders,
      activeOrders,
      delayedOrders,
      preparingOrders,
      readyOrders,
      canceledOrders,
      totals,
      netTotals,
      canceledTotals,
      byChannel,
      byStatus,
      byPaymentStatus,
    ] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.count({ where: activeWhere }),
      this.prisma.order.count({ where: delayedWhere }),
      this.prisma.order.count({ where: { ...where, status: 'IN_PREPARATION' } }),
      this.prisma.order.count({ where: { ...where, status: { in: ['READY', 'WAITING_PICKUP', 'WAITING_DISPATCH'] } } }),
      this.prisma.order.count({ where: { ...where, status: 'CANCELED' } }),
      this.prisma.order.aggregate({
        where,
        _sum: { totalAmount: true, refundedAmount: true },
      }),
      this.prisma.order.aggregate({
        where: netRevenueWhere,
        _sum: { totalAmount: true, refundedAmount: true },
        _avg: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: canceledRevenueWhere,
        _sum: { totalAmount: true, refundedAmount: true },
      }),
      this.prisma.order.groupBy({
        by: ['channel'],
        where,
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['paymentStatus'],
        where,
        _count: { _all: true },
      }),
    ]);

    return {
      totalOrders,
      activeOrders,
      delayedOrders,
      preparingOrders,
      readyOrders,
      canceledOrders,
      grossRevenue: Number(totals._sum.totalAmount ?? 0),
      netRevenue: Number(netTotals._sum.totalAmount ?? 0) - Number(netTotals._sum.refundedAmount ?? 0),
      canceledRevenue: Number(canceledTotals._sum.totalAmount ?? 0),
      averageTicket: Number(netTotals._avg.totalAmount ?? 0),
      ordersByChannel: Object.fromEntries(byChannel.map((item: any) => [item.channel, item._count._all])),
      ordersByStatus: Object.fromEntries(byStatus.map((item: any) => [item.status, item._count._all])),
      paymentsByStatus: Object.fromEntries(byPaymentStatus.map((item: any) => [item.paymentStatus, item._count._all])),
      dateFrom: filters.dateFrom.toISOString(),
      dateTo: filters.dateTo.toISOString(),
    };
  }

  async findPdvOrdersForSession(input: {
    companyId: string;
    branchId: string;
    sessionId: string;
    openedAt: Date;
    closedAt?: Date | null;
  }) {
    return this.prisma.order.findMany({
      where: {
        companyId: input.companyId,
        branchId: input.branchId,
        channel: 'PDV',
        createdAt: {
          gte: input.openedAt,
          ...(input.closedAt ? { lte: input.closedAt } : {}),
        },
        internalNotes: {
          contains: `"sessionId":"${input.sessionId}"`,
        },
      },
      select: {
        id: true,
        totalAmount: true,
        internalNotes: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateStatus(id: string, status: string, ctx: RequestContext) {
    const existing = await this.prisma.order.findFirst({
      where: {
        id,
        companyId: ctx.companyId,
        ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
      },
      select: { id: true, status: true, channel: true },
    });

    if (!existing) {
      return null;
    }

    return this.prisma.order.update({
      where: { id: existing.id },
      data: {
        status: status as any,
        timelineEvents: {
          create: {
            actorType: ctx.userRole === 'developer' ? 'USER' : 'SYSTEM',
            eventType: 'status_changed',
            previousStatus: existing.status,
            newStatus: status,
            sourceModule: ctx.channel ?? ctx.userRole,
            sourceAction: 'update_status',
            channel: existing.channel,
            correlationId: ctx.requestId,
            payload: {
              type: 'status_changed',
              status,
              message: `Pedido marcado como ${status}`,
              actor: buildActor(ctx),
            },
          },
        },
      },
      include: {
        items: {
          include: {
            addons: true,
          },
        },
        timelineEvents: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  private mapOrderStatus(status: string):
    | 'PENDING_CONFIRMATION'
    | 'CONFIRMED'
    | 'IN_PREPARATION'
    | 'READY'
    | 'DELIVERED'
    | 'CANCELED' {
    switch (status) {
      case 'CONFIRMED':
        return 'CONFIRMED';
      case 'PREPARING':
        return 'IN_PREPARATION';
      case 'READY':
        return 'READY';
      case 'DELIVERED':
        return 'DELIVERED';
      case 'CANCELLED':
        return 'CANCELED';
      case 'PAYMENT_FAILED':
      case 'CREATED':
      case 'PENDING_PAYMENT':
      default:
        return 'PENDING_CONFIRMATION';
    }
  }

  private buildOrderNumber(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const shortId = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `V2-${y}${m}${d}-${shortId}`;
  }

  private async resolveBranchId(ctx: RequestContext): Promise<string> {
    if (ctx.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: ctx.branchId,
          companyId: ctx.companyId,
        },
        select: { id: true },
      });
      if (!branch) {
        throw new Error(`Branch '${ctx.branchId}' nao pertence a company '${ctx.companyId}'.`);
      }
      return branch.id;
    }

    const fallback = await this.prisma.branch.findFirst({
      where: {
        companyId: ctx.companyId,
      },
      select: { id: true },
    });
    if (!fallback) {
      throw new Error(`Nenhuma branch encontrada para company '${ctx.companyId}'.`);
    }
    return fallback.id;
  }

  private isOrderNumberCollision(error: unknown): boolean {
    const maybe = error as { code?: string; meta?: { target?: unknown } };
    if (maybe?.code !== 'P2002') {
      return false;
    }
    const target = maybe.meta?.target;
    if (Array.isArray(target)) {
      return target.includes('order_number') || target.includes('branch_id');
    }
    return true;
  }

  private parseInternalNotes(internalNotes: string | null): Record<string, unknown> {
    if (!internalNotes?.trim()) {
      return {};
    }
    try {
      const parsed = JSON.parse(internalNotes);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private mapPaymentMethod(method: PaymentIntent['method']): PersistedPaymentMethod {
    if (method === 'PIX') return 'PIX';
    if (method === 'CREDIT_CARD') return 'CARD';
    return 'CASH';
  }

  private mapPaymentStatus(status: string): PersistedPaymentStatus {
    const normalized = String(status ?? '').toUpperCase();
    if (normalized === 'APPROVED') return 'PAID';
    if (normalized === 'DECLINED') return 'DECLINED';
    if (normalized === 'REFUNDED') return 'REFUNDED';
    if (normalized === 'EXPIRED') return 'CANCELED';
    if (normalized === 'AUTHORIZED') return 'AUTHORIZED';
    if (normalized === 'INITIATED') return 'INITIATED';
    return 'PENDING';
  }
}




