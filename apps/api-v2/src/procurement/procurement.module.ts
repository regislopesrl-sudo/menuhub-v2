import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

@Module({
  controllers: [ProcurementController],
  providers: [ProcurementService, PrismaService],
})
export class ProcurementModule {}

