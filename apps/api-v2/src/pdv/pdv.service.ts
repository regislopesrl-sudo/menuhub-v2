import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../database/prisma.service';
import { OrderPrismaRepository } from '../orders/order.prisma';

export type PdvMovementType = 'SUPPLY' | 'WITHDRAWAL' | 'SALE' | 'ADJUSTMENT';

export interface PdvSessionMovement {
  id: string;
  sessionId: string;
  branchId: string;
  type: PdvMovementType;
  amount: number;
  reason?: string;
  createdAt: string;
}

export interface PdvSessionSummary {
  sessionId: string;
  branchId: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt?: string;
  totalSales: number;
  totalOrders: number;
  avgTicket: number;
  totalsByMethod: {
    cash: number;
    pix: number;
    card: number;
  };
  movementTotals: {
    supply: number;
    withdrawal: number;
    sale: number;
    adjustment: number;
  };
  expectedCashAmount: number;
  movementsCount: number;
}

@Injectable()
export class PdvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepository: OrderPrismaRepository,
  ) {}

  async openSession(
    ctx: RequestContext,
    body?: { openingBalance?: number },
  ): Promise<{ id: string; branchId: string; status: string; openedAt: string; openingBalance: number }> {
    const branchId = await this.resolveBranchId(ctx);
    const alreadyOpen = await this.prisma.cashRegister.findFirst({
      where: {
        branchId,
        status: 'OPEN',
      },
      select: { id: true },
    });
    if (alreadyOpen) {
      throw new BadRequestException(`Ja existe caixa aberto para a filial atual (sessionId=${alreadyOpen.id}).`);
    }

    const openingBalance = Number(body?.openingBalance ?? 0);
    const opened = await this.prisma.cashRegister.create({
      data: {
        branchId,
        openingBalance,
        status: 'OPEN',
      },
      select: {
        id: true,
        branchId: true,
        status: true,
        openedAt: true,
        openingBalance: true,
      },
    });

    return {
      id: opened.id,
      branchId: opened.branchId,
      status: opened.status,
      openedAt: opened.openedAt.toISOString(),
      openingBalance: Number(opened.openingBalance),
    };
  }

  async closeSession(
    id: string,
    ctx: RequestContext,
    body?: { declaredCashAmount?: number; declaredClosingBalance?: number; closureNotes?: string },
  ) {
    const session = await this.findSessionOrThrow(id, ctx);
    if (session.status !== 'OPEN') {
      throw new BadRequestException(`Sessao '${id}' ja esta fechada.`);
    }

    const summary = await this.getSessionSummary(id, ctx);
    const declared = Number(body?.declaredCashAmount ?? body?.declaredClosingBalance ?? summary.expectedCashAmount);
    const expected = Number(summary.expectedCashAmount.toFixed(2));
    const diff = Number((declared - expected).toFixed(2));

    await this.prisma.cashRegister.update({
      where: { id: session.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        expectedClosingBalance: expected,
        declaredClosingBalance: declared,
        closingBalance: declared,
        differenceAmount: diff,
        closureNotes: body?.closureNotes?.trim() || undefined,
      },
    });

    return {
      sessionId: summary.sessionId,
      branchId: summary.branchId,
      status: 'CLOSED' as const,
      closedAt: new Date().toISOString(),
      totalSales: summary.totalSales,
      totalsByMethod: summary.totalsByMethod,
      expectedCashAmount: expected,
      declaredCashAmount: declared,
      cashDifference: diff,
    };
  }

  async getSessionSummary(id: string, ctx: RequestContext): Promise<PdvSessionSummary> {
    const session = await this.findSessionOrThrow(id, ctx);

    const orders = await this.orderRepository.findPdvOrdersForSession({
      companyId: ctx.companyId,
      branchId: session.branchId,
      sessionId: session.id,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
    });

    const totalsByMethod = { cash: 0, pix: 0, card: 0 };
    let totalSales = 0;
    for (const order of orders) {
      const total = Number(order.totalAmount);
      totalSales += total;
      const method = this.extractPaymentMethod(order.internalNotes);
      if (method === 'PIX') totalsByMethod.pix += total;
      else if (method === 'CREDIT_CARD' || method === 'CARD') totalsByMethod.card += total;
      else totalsByMethod.cash += total;
    }

    const totalOrders = orders.length;
    const avgTicket = totalOrders > 0 ? Number((totalSales / totalOrders).toFixed(2)) : 0;
    const movements = await this.prisma.cashMovement.findMany({
      where: {
        cashRegisterId: session.id,
        branchId: session.branchId,
        reversedAt: null,
      },
      select: {
        movementType: true,
        amount: true,
      },
    });
    const movementTotals = { supply: 0, withdrawal: 0, sale: 0, adjustment: 0 };
    for (const movement of movements) {
      const amount = Number(movement.amount);
      if (movement.movementType === 'DEPOSIT') movementTotals.supply += amount;
      else if (movement.movementType === 'WITHDRAWAL') movementTotals.withdrawal += amount;
      else if (movement.movementType === 'SALE') movementTotals.sale += amount;
      else if (movement.movementType === 'ADJUSTMENT') movementTotals.adjustment += amount;
    }

    const expectedCashAmount = Number(
      (
        Number(session.openingBalance) +
        totalsByMethod.cash +
        movementTotals.supply -
        movementTotals.withdrawal +
        movementTotals.sale +
        movementTotals.adjustment
      ).toFixed(2),
    );

    return {
      sessionId: session.id,
      branchId: session.branchId,
      status: session.status === 'OPEN' ? 'OPEN' : 'CLOSED',
      openedAt: session.openedAt.toISOString(),
      closedAt: session.closedAt ? session.closedAt.toISOString() : undefined,
      totalSales: Number(totalSales.toFixed(2)),
      totalOrders,
      avgTicket,
      totalsByMethod: {
        cash: Number(totalsByMethod.cash.toFixed(2)),
        pix: Number(totalsByMethod.pix.toFixed(2)),
        card: Number(totalsByMethod.card.toFixed(2)),
      },
      movementTotals: {
        supply: Number(movementTotals.supply.toFixed(2)),
        withdrawal: Number(movementTotals.withdrawal.toFixed(2)),
        sale: Number(movementTotals.sale.toFixed(2)),
        adjustment: Number(movementTotals.adjustment.toFixed(2)),
      },
      expectedCashAmount,
      movementsCount: movements.length,
    };
  }

  async createMovement(
    id: string,
    ctx: RequestContext,
    body: { type: PdvMovementType; amount: number; reason?: string },
  ): Promise<PdvSessionMovement> {
    const session = await this.findSessionOrThrow(id, ctx);
    if (session.status !== 'OPEN') {
      throw new BadRequestException('Nao e permitido lancar movimentacao em caixa fechado.');
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Valor da movimentacao deve ser maior que zero.');
    }
    const movementType = this.mapMovementType(body.type);

    const movement = await this.prisma.cashMovement.create({
      data: {
        branchId: session.branchId,
        cashRegisterId: session.id,
        movementType,
        amount,
        notes: body.reason?.trim() || undefined,
      },
      select: {
        id: true,
        cashRegisterId: true,
        branchId: true,
        movementType: true,
        amount: true,
        notes: true,
        createdAt: true,
      },
    });

    return this.mapMovement(movement);
  }

  async listMovements(id: string, ctx: RequestContext): Promise<PdvSessionMovement[]> {
    const session = await this.findSessionOrThrow(id, ctx);
    const movements = await this.prisma.cashMovement.findMany({
      where: {
        cashRegisterId: session.id,
        branchId: session.branchId,
        reversedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        cashRegisterId: true,
        branchId: true,
        movementType: true,
        amount: true,
        notes: true,
        createdAt: true,
      },
    });

    return movements.map((movement) => this.mapMovement(movement));
  }

  async getOpenSession(ctx: RequestContext) {
    const branchId = await this.resolveBranchId(ctx);
    return this.prisma.cashRegister.findFirst({
      where: {
        branchId,
        status: 'OPEN',
      },
      select: {
        id: true,
        branchId: true,
        status: true,
        openedAt: true,
        openingBalance: true,
      },
    });
  }

  async getOpenSessionOrThrow(ctx: RequestContext): Promise<{ id: string; branchId: string }> {
    const open = await this.getOpenSession(ctx);
    if (!open) {
      throw new BadRequestException('Nenhum caixa aberto para a filial atual. Abra o caixa antes de vender no PDV.');
    }
    return { id: open.id, branchId: open.branchId };
  }

  private async findSessionOrThrow(id: string, ctx: RequestContext) {
    const branchId = await this.resolveBranchId(ctx);
    const session = await this.prisma.cashRegister.findFirst({
      where: {
        id,
        branchId,
      },
      select: {
        id: true,
        branchId: true,
        status: true,
        openedAt: true,
        closedAt: true,
        openingBalance: true,
      },
    });
    if (!session) {
      throw new NotFoundException(`Sessao '${id}' nao encontrada para a filial atual.`);
    }
    return session;
  }

  private async resolveBranchId(ctx: RequestContext): Promise<string> {
    if (ctx.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: ctx.branchId, companyId: ctx.companyId },
        select: { id: true },
      });
      if (!branch) {
        throw new BadRequestException(`Branch '${ctx.branchId}' nao pertence a company '${ctx.companyId}'.`);
      }
      return branch.id;
    }

    const fallback = await this.prisma.branch.findFirst({
      where: { companyId: ctx.companyId },
      select: { id: true },
    });
    if (!fallback) {
      throw new BadRequestException(`Nenhuma branch encontrada para company '${ctx.companyId}'.`);
    }
    return fallback.id;
  }

  private extractPaymentMethod(internalNotes: string | null): string {
    if (!internalNotes?.trim()) return 'CASH';
    try {
      const parsed = JSON.parse(internalNotes) as {
        payment?: { method?: string };
      };
      return parsed.payment?.method ? String(parsed.payment.method).toUpperCase() : 'CASH';
    } catch {
      return 'CASH';
    }
  }

  private mapMovementType(type: PdvMovementType):
    | 'DEPOSIT'
    | 'WITHDRAWAL'
    | 'SALE'
    | 'ADJUSTMENT' {
    if (type === 'SUPPLY') return 'DEPOSIT';
    if (type === 'WITHDRAWAL') return 'WITHDRAWAL';
    if (type === 'SALE') return 'SALE';
    return 'ADJUSTMENT';
  }

  private mapMovement(input: {
    id: string;
    cashRegisterId: string;
    branchId: string;
    movementType: string;
    amount: number | { toString(): string };
    notes: string | null;
    createdAt: Date;
  }): PdvSessionMovement {
    return {
      id: input.id,
      sessionId: input.cashRegisterId,
      branchId: input.branchId,
      type:
        input.movementType === 'DEPOSIT'
          ? 'SUPPLY'
          : input.movementType === 'WITHDRAWAL'
            ? 'WITHDRAWAL'
            : input.movementType === 'SALE'
              ? 'SALE'
              : 'ADJUSTMENT',
      amount: Number(input.amount),
      reason: input.notes ?? undefined,
      createdAt: input.createdAt.toISOString(),
    };
  }
}
