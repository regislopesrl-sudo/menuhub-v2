import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { OrderPrismaRepository } from '../orders/order.prisma';
import { PdvController } from './pdv.controller';
import { PdvService } from './pdv.service';

@Module({
  controllers: [PdvController],
  providers: [PdvService, PrismaService, OrderPrismaRepository],
  exports: [PdvService],
})
export class PdvModule {}

