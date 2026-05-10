import { Body, Controller, Post, UseGuards } from '@nestjs/common';
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

@Controller('v2/channels')
export class ChannelsController {
  constructor(private readonly checkoutService: CheckoutService) {}

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
  ) {
    const input = mapKioskRequestToCheckoutInput(body, ctx);
    const kioskCtx: RequestContext = {
      ...ctx,
      companyId: input.companyId,
      branchId: input.storeId,
      channel: 'kiosk',
    };
    return this.checkoutService.runDeliveryCheckout(input, kioskCtx);
  }

  @Post('pdv/checkout')
  @UseGuards(ModuleGuard)
  @ModuleAccess('pdv' as any)
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
    const input = { ...mapWaiterRequestToCheckoutInput(body, ctx), saleType: 'TABLE' as const };
    return this.checkoutService.runPdvCheckout(input, ctx);
  }
}
