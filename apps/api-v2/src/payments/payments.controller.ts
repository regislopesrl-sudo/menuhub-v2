import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { PaymentsService } from './payments.service';

@Controller('v2/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook/:provider')
  webhook(
    @Param('provider') provider: string,
    @Body() payload: unknown,
  ) {
    return this.paymentsService.handleWebhook(provider, payload);
  }

  @Get(':providerPaymentId/status')
  paymentStatus(
    @Param('providerPaymentId') providerPaymentId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.paymentsService.getPaymentStatusByProviderPaymentId(providerPaymentId, ctx);
  }
}
