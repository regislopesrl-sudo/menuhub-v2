import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Module({
  controllers: [CouponsController],
  providers: [CouponsService, PrismaService],
  exports: [CouponsService],
})
export class CouponsModule {}
