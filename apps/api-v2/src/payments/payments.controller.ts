import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { Public } from '../common/public.decorator';
import { PaymentsService } from './payments.service';

@Controller('v2/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook/:provider')
  @Public()
  // Public route controlled by provider payload/idempotency; signature validation comes in provider integration phase.
  webhook(
    @Param('provider') provider: string,
    @Body() payload: unknown,
  ) {
    return this.paymentsService.handleWebhook(provider, payload);
  }

  @Get(':providerPaymentId/status')
  @Public()
  // Public checkout polling route. Response must remain sanitized and scoped by providerPaymentId validation.
  paymentStatus(
    @Param('providerPaymentId') providerPaymentId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.paymentsService.getPaymentStatusByProviderPaymentId(providerPaymentId, ctx);
  }
}
