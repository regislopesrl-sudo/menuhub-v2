import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CheckoutService } from '../checkout/checkout.service';
import { mapDeliveryRequestToCheckoutInput, type DeliveryCheckoutRequestBody } from './delivery.adapter';
import { mapKioskRequestToCheckoutInput, type KioskCheckoutRequestBody } from './kiosk.adapter';
import { mapPdvRequestToCheckoutInput, type PdvCheckoutRequestBody } from './pdv.adapter';
import { mapWaiterRequestToCheckoutInput, type WaiterCheckoutRequestBody } from './waiter.adapter';
import { ModuleAccess } from '../modules/module-access.decorator';
import { ModuleGuard } from '../modules/module.guard';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { RequirePermissions } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
import { Public } from '../common/public.decorator';
import { PrismaService } from '../database/prisma.service';
import { recordAuditFromContext } from '../common/audit-log-recorder';
import { AUDIT_ACTIONS } from '../common/audit-log';
import { isProductionLike } from '../common/runtime-env';

type HttpRequest = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
};

type IdempotencyCacheItem = {
  createdAt: number;
  response: unknown;
};

const PUBLIC_RATE_WINDOW_MS = 60_000;
const PUBLIC_RATE_MAX_PER_WINDOW = 30;
const rateWindowByKey = new Map<string, { count: number; startAt: number }>();
const idempotencyCache = new Map<string, IdempotencyCacheItem>();
const IDEMPOTENCY_TTL_MS = 5 * 60_000;

@Controller('v2/channels')
export class ChannelsController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('delivery/checkout')
  @UseGuards(ModuleGuard)
  @ModuleAccess('delivery')
  async deliveryCheckout(
    @Body() body: DeliveryCheckoutRequestBody,
    @CurrentContext() ctx: RequestContext,
  ) {
    const input = mapDeliveryRequestToCheckoutInput(body, ctx);
    return this.checkoutService.runDeliveryCheckout(input, ctx);
  }

  @Post('kiosk/checkout')
  @Public()
  async kioskCheckout(
    @Body() body: KioskCheckoutRequestBody,
    @CurrentContext() ctx: RequestContext,
    @Req() req: HttpRequest,
  ) {
    this.assertKioskToken(req);
    this.assertPublicRateLimit(req, body);
    const input = mapKioskRequestToCheckoutInput(body, ctx);
    const idempotencyKey = this.readHeader(req.headers, 'x-idempotency-key');
    if (!idempotencyKey) {
      throw new BadRequestException('Header x-idempotency-key obrigatorio para checkout kiosk.');
    }
    const cacheKey = `${input.companyId}:${input.storeId}:${idempotencyKey}`;
    this.pruneIdempotencyCache();
    const cached = idempotencyCache.get(cacheKey);
    if (cached) {
      return cached.response;
    }
    const kioskCtx: RequestContext = {
      ...ctx,
      companyId: input.companyId,
      branchId: input.storeId,
      channel: 'kiosk',
    };
    const response = await this.checkoutService.runDeliveryCheckout(input, kioskCtx);
    idempotencyCache.set(cacheKey, { createdAt: Date.now(), response });
    recordAuditFromContext({
      action: AUDIT_ACTIONS.ORDER_STATUS_UPDATE,
      outcome: 'success',
      ctx: kioskCtx,
      target: { type: 'order', id: response.order.id ?? null },
      metadata: { channel: 'kiosk', paymentMethod: input.paymentMethod },
    });
    return response;
  }

  @Post('pdv/checkout')
  @UseGuards(ModuleGuard)
  @ModuleAccess('pdv')
  @RequirePermissions(TENANT_PERMISSIONS.PDV_OPERATE)
  async pdvCheckout(
    @Body() body: PdvCheckoutRequestBody,
    @CurrentContext() ctx: RequestContext,
  ) {
    const input = mapPdvRequestToCheckoutInput(body, ctx);
    return this.checkoutService.runPdvCheckout(input, ctx);
  }

  @Post('waiter/checkout')
  @UseGuards(ModuleGuard)
  @ModuleAccess('waiter_app' as any)
  @RequirePermissions(TENANT_PERMISSIONS.WAITER_OPERATE)
  async waiterCheckout(
    @Body() body: WaiterCheckoutRequestBody,
    @CurrentContext() ctx: RequestContext,
  ) {
    const commandReference = await this.resolveWaiterCommandReference(body, ctx);
    const input = {
      ...mapWaiterRequestToCheckoutInput(
        {
          ...body,
          commandReference,
        },
        ctx,
      ),
      saleType: 'TABLE' as const,
    };
    const response = await this.checkoutService.runPdvCheckout(input, ctx);
    recordAuditFromContext({
      action: AUDIT_ACTIONS.ORDER_STATUS_UPDATE,
      outcome: 'success',
      ctx,
      target: { type: 'order', id: response.order.id ?? null },
      metadata: { channel: 'waiter_app', commandReference },
    });
    return response;
  }

  private readHeader(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
    const value = headers[key];
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    }
    if (Array.isArray(value)) {
      const normalized = value[0]?.trim();
      return normalized && normalized.length > 0 ? normalized : undefined;
    }
    return undefined;
  }

  private assertKioskToken(req: HttpRequest): void {
    const configured = String(process.env.KIOSK_PUBLIC_TOKEN ?? '').trim();
    const provided = this.readHeader(req.headers, 'x-kiosk-token');
    if (!configured) {
      if (isProductionLike()) {
        throw new UnauthorizedException('Kiosk token nao configurado para ambiente de producao.');
      }
      return;
    }
    if (!provided || provided !== configured) {
      throw new UnauthorizedException('Token de kiosk invalido.');
    }
  }

  private assertPublicRateLimit(req: HttpRequest, body: KioskCheckoutRequestBody): void {
    const companyId = String(body.companyId ?? '').trim();
    const branchId = String(body.branchId ?? '').trim();
    const ip = String(req.ip ?? this.readHeader(req.headers, 'x-forwarded-for') ?? 'unknown').trim();
    const key = `${companyId}:${branchId}:${ip}`;
    const now = Date.now();
    const state = rateWindowByKey.get(key);
    if (!state || now - state.startAt > PUBLIC_RATE_WINDOW_MS) {
      rateWindowByKey.set(key, { count: 1, startAt: now });
      return;
    }
    if (state.count >= PUBLIC_RATE_MAX_PER_WINDOW) {
      throw new HttpException('Limite de tentativas excedido para checkout kiosk.', HttpStatus.TOO_MANY_REQUESTS);
    }
    state.count += 1;
    rateWindowByKey.set(key, state);
  }

  private pruneIdempotencyCache(): void {
    const now = Date.now();
    for (const [key, value] of idempotencyCache.entries()) {
      if (now - value.createdAt > IDEMPOTENCY_TTL_MS) {
        idempotencyCache.delete(key);
      }
    }
  }

  private async resolveWaiterCommandReference(
    body: WaiterCheckoutRequestBody,
    ctx: RequestContext,
  ): Promise<string> {
    const byCommand = String(body.commandReference ?? '').trim();
    const byTable = String(body.tableId ?? '').trim();

    if (!ctx.companyId || !ctx.branchId) {
      throw new BadRequestException('Contexto de company/branch obrigatorio para waiter checkout.');
    }

    if (byCommand) {
      const command = await this.prisma.command.findFirst({
        where: {
          status: 'OPEN',
          branchId: ctx.branchId,
          branch: { companyId: ctx.companyId },
          OR: [{ id: byCommand }, { code: byCommand }],
        },
        select: { id: true, code: true },
      });
      if (!command) {
        throw new BadRequestException('Comanda nao encontrada ou fechada para esta filial.');
      }
      return command.code;
    }

    if (byTable) {
      const command = await this.prisma.command.findFirst({
        where: {
          status: 'OPEN',
          branchId: ctx.branchId,
          branch: { companyId: ctx.companyId },
          tableRestaurantId: byTable,
        },
        select: { id: true, code: true },
      });
      if (!command) {
        throw new BadRequestException('Mesa sem comanda aberta para esta filial.');
      }
      return command.code;
    }

    throw new BadRequestException('tableId ou commandReference obrigatorio para checkout waiter.');
  }
}
