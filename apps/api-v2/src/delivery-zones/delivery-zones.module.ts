import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DeliveryZonesController, PublicDeliveryZonesController } from './delivery-zones.controller';
import { DeliveryZonesService } from './delivery-zones.service';

@Module({
  controllers: [DeliveryZonesController, PublicDeliveryZonesController],
  providers: [DeliveryZonesService, PrismaService],
  exports: [DeliveryZonesService],
})
export class DeliveryZonesModule {}
