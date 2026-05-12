import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { RequestContext } from '../common/request-context';

function assertCompany(ctx: RequestContext) {
  if (!ctx.companyId) throw new BadRequestException('companyId ausente no contexto.');
}

function assertBranch(ctx: RequestContext): string {
  assertCompany(ctx);
  const branchId = String(ctx.branchId ?? '').trim();
  if (!branchId) throw new BadRequestException('branchId obrigatorio para mesas e comandas.');
  return branchId;
}

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  async listTables(ctx: RequestContext) {
    const branchId = assertBranch(ctx);
    return this.prisma.tableRestaurant.findMany({
      where: { branchId, branch: { companyId: ctx.companyId } },
      orderBy: [{ name: 'asc' }],
      include: {
        sessions: {
          where: { status: 'OPEN' },
          orderBy: { openedAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async createTable(ctx: RequestContext, input: { name?: string; capacity?: number }) {
    const branchId = assertBranch(ctx);
    const name = String(input.name ?? '').trim();
    if (!name) throw new BadRequestException('name obrigatorio.');
    const capacity = Math.max(1, Number(input.capacity ?? 1));

    return this.prisma.tableRestaurant.create({
      data: {
        branchId,
        name,
        capacity,
        status: 'FREE',
      },
    });
  }

  async updateTable(ctx: RequestContext, id: string, input: { name?: string; capacity?: number; status?: 'FREE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING' }) {
    const branchId = assertBranch(ctx);
    const table = await this.prisma.tableRestaurant.findFirst({ where: { id, branchId, branch: { companyId: ctx.companyId } } });
    if (!table) throw new NotFoundException('Mesa nao encontrada.');

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name) throw new BadRequestException('name invalido.');
      patch.name = name;
    }
    if (input.capacity !== undefined) {
      const capacity = Number(input.capacity);
      if (!Number.isFinite(capacity) || capacity < 1) throw new BadRequestException('capacity invalido.');
      patch.capacity = Math.floor(capacity);
    }
    if (input.status !== undefined) patch.status = input.status;
    if (Object.keys(patch).length === 0) throw new BadRequestException('payload vazio.');

    return this.prisma.tableRestaurant.update({ where: { id }, data: patch });
  }

  async openSession(ctx: RequestContext, tableId: string, input: { guestCount?: number; commandCode?: string }) {
    const branchId = assertBranch(ctx);
    const table = await this.prisma.tableRestaurant.findFirst({ where: { id: tableId, branchId, branch: { companyId: ctx.companyId } } });
    if (!table) throw new NotFoundException('Mesa nao encontrada.');

    const open = await this.prisma.tableSession.findFirst({ where: { tableId, branchId, status: 'OPEN' } });
    if (open) throw new BadRequestException('Mesa ja possui sessao aberta.');

    const guestCount = Math.max(1, Number(input.guestCount ?? 1));
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.tableSession.create({
        data: {
          tableId: table.id,
          branchId: table.branchId,
          guestCount,
          openedBy: ctx.userId,
          status: 'OPEN',
        },
      });

      const command = await tx.command.create({
        data: {
          branchId: table.branchId,
          tableRestaurantId: table.id,
          tableSessionId: session.id,
          guestCount,
          code: String(input.commandCode ?? `CMD-${Date.now()}`),
          status: 'OPEN',
        },
      });

      await tx.tableRestaurant.update({ where: { id: table.id }, data: { status: 'OCCUPIED' } });
      return { session, command };
    });

    return result;
  }

  async closeSession(ctx: RequestContext, sessionId: string) {
    const branchId = assertBranch(ctx);
    const session = await this.prisma.tableSession.findFirst({
      where: { id: sessionId, branchId, branch: { companyId: ctx.companyId } },
      include: { table: true },
    });
    if (!session) throw new NotFoundException('Sessao nao encontrada.');
    if (session.status !== 'OPEN') throw new BadRequestException('Sessao ja encerrada.');

    return this.prisma.$transaction(async (tx) => {
      const closedSession = await tx.tableSession.update({
        where: { id: sessionId },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedBy: ctx.userId,
        },
      });

      await tx.command.updateMany({
        where: { tableSessionId: sessionId, status: 'OPEN' },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      await tx.tableRestaurant.update({ where: { id: session.tableId }, data: { status: 'FREE' } });
      return closedSession;
    });
  }

  async transferSession(ctx: RequestContext, sessionId: string, toTableId: string) {
    const branchId = assertBranch(ctx);
    if (!toTableId) throw new BadRequestException('toTableId obrigatorio.');

    const session = await this.prisma.tableSession.findFirst({
      where: { id: sessionId, branchId, branch: { companyId: ctx.companyId }, status: 'OPEN' },
      include: { table: true },
    });
    if (!session) throw new NotFoundException('Sessao aberta nao encontrada.');

    const target = await this.prisma.tableRestaurant.findFirst({ where: { id: toTableId, branchId, branch: { companyId: ctx.companyId } } });
    if (!target) throw new NotFoundException('Mesa destino nao encontrada.');

    const targetOpen = await this.prisma.tableSession.findFirst({ where: { tableId: toTableId, branchId, status: 'OPEN' } });
    if (targetOpen) throw new BadRequestException('Mesa destino ja ocupada.');

    return this.prisma.$transaction(async (tx) => {
      await tx.tableSession.update({ where: { id: sessionId }, data: { tableId: toTableId } });
      await tx.command.updateMany({ where: { tableSessionId: sessionId }, data: { tableRestaurantId: toTableId } });
      await tx.tableRestaurant.update({ where: { id: session.tableId }, data: { status: 'FREE' } });
      await tx.tableRestaurant.update({ where: { id: toTableId }, data: { status: 'OCCUPIED' } });
      return { ok: true };
    });
  }

  async listOpenCommands(ctx: RequestContext) {
    const branchId = assertBranch(ctx);
    return this.prisma.command.findMany({
      where: {
        status: 'OPEN',
        branchId,
        branch: { companyId: ctx.companyId },
      },
      orderBy: { openedAt: 'asc' },
      include: {
        tableRestaurant: { select: { id: true, name: true } },
        tableSession: { select: { id: true, guestCount: true, openedAt: true } },
        orders: { select: { id: true, status: true, totalAmount: true, createdAt: true } },
      },
    });
  }

  async splitCommand(ctx: RequestContext, commandId: string, splitByGuests: boolean) {
    const branchId = assertBranch(ctx);
    const command = await this.prisma.command.findFirst({
      where: { id: commandId, branchId, branch: { companyId: ctx.companyId }, status: 'OPEN' },
      select: { id: true, guestCount: true },
    });
    if (!command) throw new NotFoundException('Comanda nao encontrada.');

    return {
      commandId,
      splitMode: splitByGuests ? 'BY_GUESTS' : 'EQUAL',
      guests: command.guestCount,
      message: 'Separacao de conta registrada (mock local).',
    };
  }

  async mergeCommands(ctx: RequestContext, commandIds: string[]) {
    const branchId = assertBranch(ctx);
    const ids = Array.from(new Set(commandIds.filter(Boolean)));
    if (ids.length < 2) throw new BadRequestException('Informe pelo menos duas comandas para juntar.');

    const commands = await this.prisma.command.findMany({
      where: { id: { in: ids }, branchId, branch: { companyId: ctx.companyId }, status: 'OPEN' },
      select: { id: true, code: true },
    });

    if (commands.length !== ids.length) {
      throw new BadRequestException('Uma ou mais comandas nao estao abertas/validas.');
    }

    return {
      mergedCommandIds: ids,
      message: 'Juncao de comandas registrada (mock local).',
    };
  }
}

