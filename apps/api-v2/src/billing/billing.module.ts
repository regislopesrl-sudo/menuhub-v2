import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PrismaService } from '../database/prisma.service';
import { BILLING_PROVIDER_TOKEN } from './providers/billing-provider.tokens';
import { MockBillingProvider } from './providers/mock-billing.provider';
import { MercadoPagoBillingProvider } from './providers/mercado-pago-billing.provider';
import { BillingWebhookController } from './billing.webhook.controller';

function resolveBillingProviderFromEnv(): 'mock' | 'mercado_pago' {
  const provider = (process.env.BILLING_PROVIDER ?? 'mock').trim().toLowerCase();
  return provider === 'mercado_pago' ? 'mercado_pago' : 'mock';
}

@Module({
  controllers: [BillingController, BillingWebhookController],
  providers: [
    BillingService,
    PrismaService,
    MockBillingProvider,
    MercadoPagoBillingProvider,
    {
      provide: BILLING_PROVIDER_TOKEN,
      inject: [MockBillingProvider, MercadoPagoBillingProvider],
      useFactory: (mock: MockBillingProvider, mercadoPago: MercadoPagoBillingProvider) => {
        return resolveBillingProviderFromEnv() === 'mercado_pago' ? mercadoPago : mock;
      },
    },
  ],
})
export class BillingModule {}
