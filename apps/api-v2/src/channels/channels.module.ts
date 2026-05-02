import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { CheckoutModule } from '../checkout/checkout.module';
import { ModulesModule } from '../modules/modules.module';

@Module({
  imports: [CheckoutModule, ModulesModule],
  controllers: [ChannelsController],
})
export class ChannelsModule {}

