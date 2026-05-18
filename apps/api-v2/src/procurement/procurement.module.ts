import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../common/audit-log.service';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { PurchasesBackendService } from './purchases-backend.service';

@Module({
  controllers: [ProcurementController],
  providers: [ProcurementService, PurchasesBackendService, AuditLogService, PrismaService],
  exports: [ProcurementService, PurchasesBackendService],
})
export class ProcurementModule {}
