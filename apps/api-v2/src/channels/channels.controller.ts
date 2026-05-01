import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CheckoutService } from '../checkout/checkout.service';
import { mapDeliveryRequestToCheckoutInput, type DeliveryCheckoutRequestBody } from './delivery.adapter';
import { mapPdvRequestToCheckoutInput, type PdvCheckoutRequestBody } from './pdv.adapter';
import { ModuleAccess } from '../modules/module-access.decorator';
import { ModuleGuard } from '../modules/module.guard';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';

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

  @Post('pdv/checkout')
  @UseGuards(ModuleGuard)
  @ModuleAccess('pdv' as any)
  async pdvCheckout(
    @Body() body: PdvCheckoutRequestBody,
    @CurrentContext() ctx: RequestContext,
  ) {
    const input = mapPdvRequestToCheckoutInput(body, ctx);
    return this.checkoutService.runPdvCheckout(input, ctx);
  }
}
