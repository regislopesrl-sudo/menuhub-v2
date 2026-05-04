import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PrismaService } from '../database/prisma.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, PrismaService],
})
export class BillingModule {}
