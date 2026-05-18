import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../common/audit-log.service';
import { BiImportsBackendService } from './bi-imports-backend.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [FinanceModule],
  controllers: [ReportsController],
  providers: [ReportsService, BiImportsBackendService, AuditLogService, PrismaService],
  exports: [ReportsService, BiImportsBackendService],
})
export class ReportsModule {}
