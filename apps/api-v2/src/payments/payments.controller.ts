import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { PaymentsService } from './payments.service';
import { Public } from '../common/public.decorator';

@Controller('v2/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook/:provider')
  @Public()
  webhook(
    @Param('provider') provider: string,
    @Body() payload: unknown,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const dataId =
      payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)
        ? String((((payload as Record<string, unknown>).data as Record<string, unknown> | undefined)?.id ?? '') || '')
        : '';

    return this.paymentsService.handleWebhook(provider, payload, {
      signature,
      requestId,
      dataId: dataId || undefined,
    });
  }

  @Get(':providerPaymentId/status')
  paymentStatus(
    @Param('providerPaymentId') providerPaymentId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.paymentsService.getPaymentStatusByProviderPaymentId(providerPaymentId, ctx);
  }
}
