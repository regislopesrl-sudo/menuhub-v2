import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ModulesModule } from '../modules/modules.module';
import { AuditLogService } from '../common/audit-log.service';
import { InventoryBackendService } from './inventory-backend.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [ModulesModule],
  controllers: [StockController],
  providers: [StockService, InventoryBackendService, AuditLogService, PrismaService],
  exports: [StockService, InventoryBackendService],
})
export class StockModule {}
