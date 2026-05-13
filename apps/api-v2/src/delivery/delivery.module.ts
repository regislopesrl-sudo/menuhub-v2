import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryFeeConfigService } from './delivery-fee-config.service';
import { ModulesModule } from '../modules/modules.module';
import { CepGeocodingService, InMemoryCepGeocodingProvider } from './cep-geocoding.service';
import { DeliveryQuoteService } from './delivery-quote.service';
import { DeliveryAreaRepository } from './delivery-area.repository';
import { PrismaService } from '../database/prisma.service';
import { InMemoryRouteDistanceProvider, RouteDistanceService } from './route-distance.service';
import { BranchLocationService } from './branch-location.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [ModulesModule, SettingsModule],
  controllers: [DeliveryController],
  providers: [
    DeliveryService,
    DeliveryFeeConfigService,
    InMemoryCepGeocodingProvider,
    CepGeocodingService,
    DeliveryQuoteService,
    DeliveryAreaRepository,
    InMemoryRouteDistanceProvider,
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
