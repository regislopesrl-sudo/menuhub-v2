import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryFeeConfigService } from './delivery-fee-config.service';
import { ModulesModule } from '../modules/modules.module';
import { CepGeocodingService } from './cep-geocoding.service';
import { DeliveryQuoteService } from './delivery-quote.service';
import { DeliveryAreaRepository } from './delivery-area.repository';
import { PrismaService } from '../database/prisma.service';
import { RouteDistanceService } from './route-distance.service';
import { BranchLocationService } from './branch-location.service';

@Module({
  imports: [ModulesModule],
  controllers: [DeliveryController],
  providers: [
    DeliveryService,
    DeliveryFeeConfigService,
    CepGeocodingService,
    DeliveryQuoteService,
    DeliveryAreaRepository,
    RouteDistanceService,
    BranchLocationService,
    PrismaService,
  ],
  exports: [
    DeliveryService,
    DeliveryQuoteService,
    CepGeocodingService,
    RouteDistanceService,
    BranchLocationService,
  ],
})
export class DeliveryModule {}
