import { Module } from '@nestjs/common';
import { ModulesModule } from '../modules/modules.module';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../common/audit-log.service';
import { FinanceController } from './finance.controller';
import { FinanceBackendService } from './finance-backend.service';
import { FinanceService } from './finance.service';

@Module({
  imports: [ModulesModule],
  controllers: [FinanceController],
  providers: [FinanceService, FinanceBackendService, AuditLogService, PrismaService],
  exports: [FinanceService, FinanceBackendService],
})
export class FinanceModule {}
