import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MercadoPagoPixProvider } from './providers/mercado-pago-pix.provider';
import { MockPixPaymentProvider } from './providers/mock-pix-payment.provider';
import { PAYMENT_PROVIDER_TOKEN } from './providers/payment-provider.tokens';

export function resolvePaymentProviderFromEnv(): 'mock' | 'mercadopago' {
  const provider = (process.env.PAYMENT_PROVIDER ?? 'mock').trim().toLowerCase();
  return provider === 'mercadopago' ? 'mercadopago' : 'mock';
}

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    MockPixPaymentProvider,
    MercadoPagoPixProvider,
    {
      provide: PAYMENT_PROVIDER_TOKEN,
      inject: [MockPixPaymentProvider, MercadoPagoPixProvider],
      useFactory: (mockProvider: MockPixPaymentProvider, mercadoPagoProvider: MercadoPagoPixProvider) => {
        return resolvePaymentProviderFromEnv() === 'mercadopago' ? mercadoPagoProvider : mockProvider;
      },
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
