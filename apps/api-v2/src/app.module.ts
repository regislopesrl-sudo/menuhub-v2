import { Module } from '@nestjs/common';
import { ChannelsModule } from './channels/channels.module';
import { ModulesModule } from './modules/modules.module';
import { OrdersModule } from './orders/orders.module';
import { MenuModule } from './menu/menu.module';
import { DeliveryModule } from './delivery/delivery.module';
import { PaymentsModule } from './payments/payments.module';
import { KdsModule } from './kds/kds.module';
import { PdvModule } from './pdv/pdv.module';
import { DeveloperModule } from './developer/developer.module';
import { HealthController } from './health.controller';
import { BillingModule } from './billing/billing.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [ModulesModule, ChannelsModule, OrdersModule, MenuModule, DeliveryModule, PaymentsModule, KdsModule, PdvModule, DeveloperModule, BillingModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
