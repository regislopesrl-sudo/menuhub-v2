import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CheckoutService, type CheckoutQuoteInput } from './checkout.service';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { ModuleGuard } from '../modules/module.guard';
import { ModuleAccess } from '../modules/module-access.decorator';
import { Public } from '../common/public.decorator';

@Controller('v2/checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('quote')
  @Public()
  @UseGuards(ModuleGuard)
  @ModuleAccess('delivery')
  quote(
    @Body() body: CheckoutQuoteInput,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.checkoutService.quoteDeliveryCheckout(body, ctx);
  }
}
