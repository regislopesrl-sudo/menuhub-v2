import { Module } from '@nestjs/common';
import { ChannelsModule } from './channels/channels.module';
import { ModulesModule } from './modules/modules.module';
import { OrdersModule } from './orders/orders.module';
import { MenuModule } from './menu/menu.module';
import { DeliveryModule } from './delivery/delivery.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [ModulesModule, ChannelsModule, OrdersModule, MenuModule, DeliveryModule, PaymentsModule],
})
export class AppModule {}
