import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RequireAdminGuard } from '../../common/require-admin.guard';
import { StockModule } from '../../stock/stock.module';
import { BranchSalesHistoryController } from './branch-sales-history.controller';
import { BranchSalesHistoryService } from './branch-sales-history.service';

@Module({
  imports: [StockModule],
  controllers: [BranchSalesHistoryController],
  providers: [BranchSalesHistoryService, PrismaService, RequireAdminGuard],
})
export class BranchSalesHistoryModule {}
