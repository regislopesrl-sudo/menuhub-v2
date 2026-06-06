import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async listCustomers(ctx: RequestContext, query: { search?: string; limit?: string } = {}) {
    const search = this.optionalString(query.search);
    const limit = this.positiveInt(query.limit, 50);
    const customers = await this.prisma.customer.findMany({
      where: {
        companyId: ctx.companyId,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { whatsapp: { contains: search } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        loyaltyAccount: true,
        orders: {
          select: { id: true, totalAmount: true, createdAt: true, status: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    return {
      items: customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        whatsapp: customer.whatsapp,
        email: customer.email,
        cpfCnpj: customer.cpfCnpj,
        isVip: customer.isVip,
        isBlocked: customer.isBlocked,
        loyaltyBalance: customer.loyaltyAccount?.balance ?? 0,
        lastOrders: customer.orders.map((order) => ({
          ...order,
          totalAmount: this.money(order.totalAmount),
        })),
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      })),
    };
  }

  async getCustomerHistory(ctx: RequestContext, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId: ctx.companyId, deletedAt: null },
      include: {
        loyaltyAccount: true,
        loyaltyTransactions: { orderBy: { createdAt: 'desc' }, take: 50 },
        orders: {
          include: { items: { select: { productNameSnapshot: true, quantity: true, totalPrice: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        reviews: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!customer) throw new NotFoundException('Cliente nao encontrado.');

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        whatsapp: customer.whatsapp,
        email: customer.email,
        isVip: customer.isVip,
        isBlocked: customer.isBlocked,
        loyaltyBalance: customer.loyaltyAccount?.balance ?? 0,
      },
      orders: customer.orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        channel: order.channel,
        totalAmount: this.money(order.totalAmount),
        createdAt: order.createdAt,
        items: order.items.map((item) => ({
          name: item.productNameSnapshot,
          quantity: Number(item.quantity),
          totalPrice: this.money(item.totalPrice),
        })),
      })),
      loyaltyTransactions: customer.loyaltyTransactions.map((transaction) => ({
        id: transaction.id,
        transactionType: transaction.transactionType,
        points: transaction.points,
        monetaryValue: transaction.monetaryValue === null ? null : this.money(transaction.monetaryValue),
        balanceBefore: transaction.balanceBefore,
        balanceAfter: transaction.balanceAfter,
        description: transaction.description,
        createdAt: transaction.createdAt,
      })),
      reviews: customer.reviews,
    };
  }

  async getLoyalty(ctx: RequestContext, customerId: string) {
    await this.assertCustomer(ctx, customerId);
    const account = await this.prisma.loyaltyAccount.upsert({
      where: { customerId },
      create: { companyId: ctx.companyId, customerId, balance: 0 },
      update: {},
    });
    return account;
  }

  async adjustLoyalty(ctx: RequestContext, customerId: string, body: { points?: number; reason?: string }) {
    await this.assertCustomer(ctx, customerId);
    const points = Number(body.points);
    if (!Number.isInteger(points) || points === 0) {
      throw new BadRequestException('Pontos devem ser inteiros e diferentes de zero.');
    }

    const current = await this.prisma.loyaltyAccount.upsert({
      where: { customerId },
      create: { companyId: ctx.companyId, customerId, balance: 0 },
      update: {},
    });
    const nextBalance = Math.max(0, current.balance + points);
    const [account, transaction] = await this.prisma.$transaction([
      this.prisma.loyaltyAccount.update({
        where: { customerId },
        data: { balance: nextBalance },
      }),
      this.prisma.loyaltyTransaction.create({
        data: {
          companyId: ctx.companyId,
          customerId,
          transactionType: points > 0 ? 'CREDIT' : 'DEBIT',
          points,
          balanceBefore: current.balance,
          balanceAfter: nextBalance,
          availablePoints: nextBalance,
          description: this.optionalString(body.reason) ?? 'Ajuste manual CRM',
        },
      }),
    ]);

    return { account, transaction, cashbackMock: { cannotBeNegative: true } };
  }

  private async assertCustomer(ctx: RequestContext, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId: ctx.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Cliente nao encontrado.');
  }

  private optionalString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }

  private positiveInt(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 200) : fallback;
  }

  private money(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
  }
}
