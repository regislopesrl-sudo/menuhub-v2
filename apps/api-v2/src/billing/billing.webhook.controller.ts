import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { BillingService } from './billing.service';
import { Public } from '../common/public.decorator';

@Controller('v2/billing/webhooks')
export class BillingWebhookController {
  constructor(private readonly billingService: BillingService) {}

  @Post(':provider')
  @Public()
  // Public route controlled by provider payload/idempotency; signature validation comes in billing provider integration phase.
  async handleWebhook(
    @Param('provider') provider: string,
    @Body() payload: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.billingService.handleWebhook(provider, payload, headers);
  }
}
