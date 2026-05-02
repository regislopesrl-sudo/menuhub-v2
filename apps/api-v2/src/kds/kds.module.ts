import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ModulesModule } from '../modules/modules.module';
import { KdsController } from './kds.controller';
import { KdsService } from './kds.service';

@Module({
  imports: [OrdersModule, ModulesModule],
  controllers: [KdsController],
  providers: [KdsService],
})
export class KdsModule {}
