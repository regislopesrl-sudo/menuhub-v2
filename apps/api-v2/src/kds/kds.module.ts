import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { KdsController } from './kds.controller';
import { KdsService } from './kds.service';

@Module({
  imports: [OrdersModule],
  controllers: [KdsController],
  providers: [KdsService],
})
export class KdsModule {}

