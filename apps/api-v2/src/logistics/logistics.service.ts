import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DriverStatus, OrderStatus, OrderType } from '@prisma/client';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../database/prisma.service';

type DriverInput = {
  name?: string;
  phone?: string | null;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  document?: string | null;
  commissionType?: string | null;
  commissionValue?: number | null;
  status?: DriverStatus;
  isOnline?: boolean;
  isActive?: boolean;
};

type DeliveryStatusInput = {
  status: 'ASSIGNED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';
  failedReason?: string;
};

const DISPATCH_ASSIGNABLE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.READY,
  OrderStatus.WAITING_DISPATCH,
];

@Injectable()
export class LogisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async listDrivers(ctx: RequestContext) {
    const branchId = await this.resolveBranchId(ctx);
    const today = this.startOfToday();
    const drivers = await this.prisma.courier.findMany({
      where: { branchId },
      include: {
        deliveries: {
          where: { assignedAt: { gte: today } },
          include: { order: { select: { totalAmount: true } } },
          orderBy: { assignedAt: 'desc' },
        },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return {
      branchId,
      items: drivers.map((driver) => {
        const deliveredToday = driver.deliveries.filter((delivery) => delivery.deliveredAt).length;
        const failedToday = driver.deliveries.filter((delivery) => delivery.failedAt).length;
        const openDeliveries = driver.deliveries.filter((delivery) => !delivery.deliveredAt && !delivery.failedAt).length;
        const averageDeliveryMinutes = this.averageDeliveryMinutes(driver.deliveries);
        const payoutToday = driver.deliveries.reduce(
          (sum, delivery) => sum + this.deliveryPayout(driver, delivery.order.totalAmount),
          0,
        );

        return {
          id: driver.id,
          name: driver.name,
          phone: driver.phone,
          vehicleType: driver.vehicleType,
          vehiclePlate: driver.vehiclePlate,
          document: driver.document,
          commissionType: driver.commissionType,
          commissionValue: this.money(driver.commissionValue),
          status: driver.status,
          isOnline: driver.isOnline,
          isActive: driver.isActive,
          deliveriesCount: driver.deliveries.length,
          deliveriesToday: driver.deliveries.length,
          deliveredToday,
          failedToday,
          openDeliveries,
          averageDeliveryMinutes,
          payoutToday: this.roundMoney(payoutToday),
          createdAt: driver.createdAt,
          updatedAt: driver.updatedAt,
        };
      }),
    };
  }

  async createDriver(ctx: RequestContext, body: DriverInput) {
    const branchId = await this.resolveBranchId(ctx);
    const name = this.requiredString(body.name, 'Nome do entregador');
    const driver = await this.prisma.courier.create({
      data: {
        branchId,
        name,
        phone: this.optionalString(body.phone),
        vehicleType: this.optionalString(body.vehicleType),
        vehiclePlate: this.optionalString(body.vehiclePlate),
        document: this.optionalString(body.document),
        commissionType: this.optionalString(body.commissionType) ?? 'fixed',
        commissionValue: this.optionalMoney(body.commissionValue),
        status: body.status ?? DriverStatus.AVAILABLE,
        isOnline: body.isOnline ?? true,
        isActive: body.isActive ?? true,
      },
    });
    return driver;
  }

  async updateDriver(ctx: RequestContext, driverId: string, body: DriverInput) {
    const branchId = await this.resolveBranchId(ctx);
    await this.assertDriverInBranch(driverId, branchId);
    return this.prisma.courier.update({
      where: { id: driverId },
      data: {
        ...(body.name !== undefined ? { name: this.requiredString(body.name, 'Nome do entregador') } : {}),
        ...(body.phone !== undefined ? { phone: this.optionalString(body.phone) } : {}),
        ...(body.vehicleType !== undefined ? { vehicleType: this.optionalString(body.vehicleType) } : {}),
        ...(body.vehiclePlate !== undefined ? { vehiclePlate: this.optionalString(body.vehiclePlate) } : {}),
        ...(body.document !== undefined ? { document: this.optionalString(body.document) } : {}),
        ...(body.commissionType !== undefined ? { commissionType: this.optionalString(body.commissionType) } : {}),
        ...(body.commissionValue !== undefined ? { commissionValue: this.optionalMoney(body.commissionValue) } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.isOnline !== undefined ? { isOnline: Boolean(body.isOnline) } : {}),
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      },
    });
  }

  async assignDriver(ctx: RequestContext, orderId: string, body: { driverId?: string }) {
    const branchId = await this.resolveBranchId(ctx);
    const driverId = this.requiredString(body.driverId, 'Entregador');
    const [order, driver] = await Promise.all([
      this.prisma.order.findFirst({
        where: { id: orderId, companyId: ctx.companyId, branchId },
        select: { id: true, orderNumber: true, status: true, orderType: true, customerAddressId: true },
      }),
      this.prisma.courier.findFirst({
        where: { id: driverId, branchId },
        select: { id: true, isActive: true, status: true, name: true },
      }),
    ]);

    if (!order) {
      throw new NotFoundException('Pedido nao encontrado na filial atual.');
    }
    if (order.orderType !== OrderType.DELIVERY) {
      throw new BadRequestException('Somente pedidos de delivery podem receber entregador.');
    }
    if (!DISPATCH_ASSIGNABLE_ORDER_STATUSES.includes(order.status)) {
      throw new BadRequestException('Pedido ainda nao esta pronto para despacho. Aguarde a cozinha marcar como pronto.');
    }
    if (!order.customerAddressId) {
      throw new BadRequestException('Pedido sem endereco de entrega. Corrija o endereco antes de atribuir entregador.');
    }
    if (!driver || !driver.isActive) {
      throw new BadRequestException('Entregador inativo ou fora da filial atual.');
    }
    if (driver.status === DriverStatus.OFFLINE) {
      throw new BadRequestException('Entregador offline. Marque como disponivel antes de atribuir.');
    }

    const existing = await this.prisma.courierDelivery.findFirst({
      where: { orderId, deliveredAt: null, failedAt: null },
      orderBy: { assignedAt: 'desc' },
    });
    const delivery = existing
      ? await this.prisma.courierDelivery.update({
          where: { id: existing.id },
          data: { courierId: driverId, assignedAt: new Date(), failedAt: null, failedReason: null },
        })
      : await this.prisma.courierDelivery.create({ data: { orderId, courierId: driverId } });

    await this.prisma.courier.update({
      where: { id: driverId },
      data: { status: DriverStatus.ON_DELIVERY, isOnline: true },
    });
    const nextOrderStatus = OrderStatus.WAITING_DISPATCH;
    if (nextOrderStatus !== order.status) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: nextOrderStatus },
      });
    }

    return {
      delivery: this.mapDeliveryStatus(delivery),
      order: { id: order.id, orderNumber: order.orderNumber, status: nextOrderStatus },
      courier: { id: driver.id, name: driver.name },
      tracking: 'driver_assigned',
    };
  }

  async updateDeliveryStatus(ctx: RequestContext, deliveryId: string, body: DeliveryStatusInput) {
    const branchId = await this.resolveBranchId(ctx);
    const delivery = await this.prisma.courierDelivery.findFirst({
      where: { id: deliveryId, order: { companyId: ctx.companyId, branchId } },
      include: { order: { select: { id: true, status: true } }, courier: true },
    });
    if (!delivery) {
      throw new NotFoundException('Entrega nao encontrada na filial atual.');
    }

    const now = new Date();
    const data =
      body.status === 'OUT_FOR_DELIVERY'
        ? { outForDeliveryAt: now, failedAt: null, failedReason: null }
        : body.status === 'DELIVERED'
          ? { deliveredAt: now, failedAt: null, failedReason: null }
          : body.status === 'FAILED'
            ? { failedAt: now, failedReason: this.optionalString(body.failedReason) ?? 'Falha operacional' }
            : { failedAt: null, failedReason: null };

    const updated = await this.prisma.courierDelivery.update({ where: { id: deliveryId }, data });

    if (body.status === 'OUT_FOR_DELIVERY') {
      await Promise.all([
        this.prisma.order.update({
          where: { id: delivery.order.id },
          data: { status: OrderStatus.OUT_FOR_DELIVERY, dispatchedAt: now },
        }),
        this.prisma.courier.update({
          where: { id: delivery.courierId },
          data: { status: DriverStatus.ON_DELIVERY, isOnline: true },
        }),
      ]);
    }
    if (body.status === 'DELIVERED') {
      await Promise.all([
        this.prisma.order.update({
          where: { id: delivery.order.id },
          data: { status: OrderStatus.DELIVERED, deliveredAt: now },
        }),
        this.prisma.courier.update({
          where: { id: delivery.courierId },
          data: { status: DriverStatus.AVAILABLE },
        }),
      ]);
    }
    if (body.status === 'FAILED') {
      await Promise.all([
        this.prisma.courier.update({
          where: { id: delivery.courierId },
          data: { status: DriverStatus.AVAILABLE },
        }),
        this.prisma.order.update({
          where: { id: delivery.order.id },
          data: { status: OrderStatus.WAITING_DISPATCH },
        }),
      ]);
    }

    return { delivery: this.mapDeliveryStatus(updated), status: body.status };
  }

  async listDeliveries(ctx: RequestContext, query: { limit?: string } = {}) {
    const branchId = await this.resolveBranchId(ctx);
    const limit = this.positiveInt(query.limit, 50);
    const deliveries = await this.prisma.courierDelivery.findMany({
      where: { order: { companyId: ctx.companyId, branchId } },
      include: {
        courier: { select: { id: true, name: true, phone: true, status: true, isActive: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            totalAmount: true,
            deliveryFee: true,
            createdAt: true,
            publicTrackingToken: true,
            customer: { select: { name: true, phone: true, whatsapp: true } },
            customerAddress: {
              select: { street: true, number: true, district: true, city: true, state: true, reference: true },
            },
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
      take: limit,
    });
    return {
      branchId,
      items: deliveries.map((delivery) => ({
        id: delivery.id,
        assignedAt: delivery.assignedAt,
        outForDeliveryAt: delivery.outForDeliveryAt,
        deliveredAt: delivery.deliveredAt,
        failedAt: delivery.failedAt,
        failedReason: delivery.failedReason,
        status: this.deliveryStatus(delivery),
        elapsedMinutes: this.elapsedMinutes(delivery.assignedAt, delivery.deliveredAt ?? delivery.failedAt ?? new Date()),
        courier: delivery.courier,
        order: {
          ...delivery.order,
          totalAmount: this.money(delivery.order.totalAmount),
          deliveryFee: this.money(delivery.order.deliveryFee),
          trackingToken: delivery.order.publicTrackingToken,
          trackingUrl: this.trackingUrl(delivery.order.publicTrackingToken),
        },
      })),
    };
  }

  async getSummary(ctx: RequestContext) {
    const branchId = await this.resolveBranchId(ctx);
    const today = this.startOfToday();
    const [activeDrivers, onlineDrivers, availableDrivers, onDeliveryDrivers, deliveriesToday, failedToday, openDeliveries, pendingDispatchOrders, deliveredRows] = await Promise.all([
      this.prisma.courier.count({ where: { branchId, isActive: true } }),
      this.prisma.courier.count({ where: { branchId, isActive: true, isOnline: true } }),
      this.prisma.courier.count({ where: { branchId, isActive: true, isOnline: true, status: DriverStatus.AVAILABLE } }),
      this.prisma.courier.count({ where: { branchId, isActive: true, status: DriverStatus.ON_DELIVERY } }),
      this.prisma.courierDelivery.count({
        where: { order: { companyId: ctx.companyId, branchId }, assignedAt: { gte: today } },
      }),
      this.prisma.courierDelivery.count({
        where: { order: { companyId: ctx.companyId, branchId }, failedAt: { gte: today } },
      }),
      this.prisma.courierDelivery.count({
        where: { order: { companyId: ctx.companyId, branchId }, deliveredAt: null, failedAt: null },
      }),
      this.prisma.order.count({
        where: {
          companyId: ctx.companyId,
          branchId,
          orderType: OrderType.DELIVERY,
          deletedAt: null,
          status: { in: [...DISPATCH_ASSIGNABLE_ORDER_STATUSES] },
          courierDeliveries: { none: { deliveredAt: null, failedAt: null } },
        },
      }),
      this.prisma.courierDelivery.findMany({
        where: { order: { companyId: ctx.companyId, branchId }, deliveredAt: { gte: today } },
        include: { courier: true, order: { select: { totalAmount: true } } },
        take: 200,
      }),
    ]);
    const averageDeliveryMinutes = this.averageDeliveryMinutes(deliveredRows);
    const courierPayoutToday = deliveredRows.reduce(
      (sum, delivery) => sum + this.deliveryPayout(delivery.courier, delivery.order.totalAmount),
      0,
    );
    return {
      branchId,
      activeDrivers,
      onlineDrivers,
      availableDrivers,
      onDeliveryDrivers,
      deliveriesToday,
      failedToday,
      openDeliveries,
      pendingDispatchOrders,
      deliveredToday: deliveredRows.length,
      averageDeliveryMinutes,
      courierPayoutToday: this.roundMoney(courierPayoutToday),
      health:
        pendingDispatchOrders > availableDrivers && pendingDispatchOrders > 0
          ? 'ATTENTION'
          : failedToday > 0
            ? 'REVIEW'
            : 'OK',
      provider: 'courier-local',
    };
  }

  async listAssignableOrders(ctx: RequestContext, query: { limit?: string } = {}) {
    const branchId = await this.resolveBranchId(ctx);
    const limit = this.positiveInt(query.limit, 80);
    const orders = await this.prisma.order.findMany({
      where: {
        companyId: ctx.companyId,
        branchId,
        orderType: OrderType.DELIVERY,
        deletedAt: null,
        status: { in: [...DISPATCH_ASSIGNABLE_ORDER_STATUSES] },
      },
      include: {
        customer: { select: { name: true, phone: true, whatsapp: true } },
        customerAddress: {
          select: { street: true, number: true, district: true, city: true, state: true, reference: true },
        },
        courierDeliveries: {
          take: 1,
          orderBy: { assignedAt: 'desc' },
          include: { courier: { select: { id: true, name: true, phone: true, status: true, isActive: true } } },
        },
      },
      orderBy: [{ priority: 'desc' }, { readyAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });

    return {
      branchId,
      items: orders.map((order) => {
        const latestDelivery = order.courierDeliveries[0] ?? null;
        const activeDelivery = latestDelivery && !latestDelivery.deliveredAt && !latestDelivery.failedAt ? latestDelivery : null;
        const dispatchBlockers = this.dispatchBlockers(order);
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalAmount: this.money(order.totalAmount),
          deliveryFee: this.money(order.deliveryFee),
          createdAt: order.createdAt,
          readyAt: order.readyAt,
          publicTrackingToken: order.publicTrackingToken,
          trackingUrl: this.trackingUrl(order.publicTrackingToken),
          customer: order.customer,
          address: order.customerAddress,
          assignmentStatus: activeDelivery ? this.deliveryStatus(activeDelivery) : 'UNASSIGNED',
          courier: activeDelivery?.courier ?? null,
          deliveryId: activeDelivery?.id ?? null,
          waitingMinutes: this.elapsedMinutes(order.readyAt ?? order.createdAt, new Date()),
          canAssign: dispatchBlockers.length === 0,
          dispatchBlockers,
        };
      }),
    };
  }

  private dispatchBlockers(order: {
    status: OrderStatus;
    customerAddress?: { street?: string | null; number?: string | null; district?: string | null } | null;
  }): string[] {
    const blockers: string[] = [];
    if (!DISPATCH_ASSIGNABLE_ORDER_STATUSES.includes(order.status)) {
      blockers.push('Pedido ainda nao esta pronto para despacho.');
    }
    if (!order.customerAddress?.street || !order.customerAddress?.district) {
      blockers.push('Endereco de entrega incompleto.');
    }
    return blockers;
  }

  private async resolveBranchId(ctx: RequestContext): Promise<string> {
    const branchId = ctx.branchId;
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, companyId: ctx.companyId },
        select: { id: true },
      });
      if (branch) return branch.id;
    }
    const branch = await this.prisma.branch.findFirst({
      where: { companyId: ctx.companyId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!branch) throw new BadRequestException('Nenhuma filial encontrada para logistica.');
    return branch.id;
  }

  private async assertDriverInBranch(driverId: string, branchId: string) {
    const driver = await this.prisma.courier.findFirst({ where: { id: driverId, branchId }, select: { id: true } });
    if (!driver) throw new NotFoundException('Entregador nao encontrado na filial atual.');
  }

  private requiredString(value: unknown, label: string): string {
    const normalized = this.optionalString(value);
    if (!normalized) throw new BadRequestException(`${label} e obrigatorio.`);
    return normalized;
  }

  private optionalString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }

  private optionalMoney(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException('Valor de comissao invalido.');
    }
    return parsed as any;
  }

  private money(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
  }

  private roundMoney(value: number): number {
    return Number(value.toFixed(2));
  }

  private deliveryPayout(courier: { commissionType?: string | null; commissionValue?: unknown }, orderTotal: unknown): number {
    const commissionValue = this.money(courier.commissionValue);
    if (commissionValue <= 0) return 0;
    const commissionType = String(courier.commissionType ?? '').toLowerCase();
    if (['percent', 'percentage', 'percentual'].includes(commissionType)) {
      return (this.money(orderTotal) * commissionValue) / 100;
    }
    return commissionValue;
  }

  private averageDeliveryMinutes(deliveries: Array<{ assignedAt: Date; deliveredAt?: Date | null }>): number {
    const delivered = deliveries
      .map((delivery) => this.elapsedMinutes(delivery.assignedAt, delivery.deliveredAt ?? null))
      .filter((minutes) => minutes > 0);
    if (!delivered.length) return 0;
    return Math.round(delivered.reduce((sum, minutes) => sum + minutes, 0) / delivered.length);
  }

  private elapsedMinutes(start: Date | null | undefined, end: Date | null | undefined): number {
    if (!start || !end) return 0;
    const elapsed = Math.max(0, end.getTime() - start.getTime());
    return Math.round(elapsed / 60_000);
  }

  private deliveryStatus(delivery: {
    outForDeliveryAt?: Date | null;
    deliveredAt?: Date | null;
    failedAt?: Date | null;
  }): 'ASSIGNED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' {
    if (delivery.failedAt) return 'FAILED';
    if (delivery.deliveredAt) return 'DELIVERED';
    if (delivery.outForDeliveryAt) return 'OUT_FOR_DELIVERY';
    return 'ASSIGNED';
  }

  private mapDeliveryStatus<T extends { outForDeliveryAt?: Date | null; deliveredAt?: Date | null; failedAt?: Date | null }>(
    delivery: T,
  ) {
    return { ...delivery, status: this.deliveryStatus(delivery) };
  }

  private trackingUrl(token?: string | null): string | null {
    return token ? `/delivery?tracking=${encodeURIComponent(token)}` : null;
  }

  private positiveInt(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 200) : fallback;
  }

  private startOfToday(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }
}
