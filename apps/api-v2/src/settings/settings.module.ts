import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { BranchSalesHistoryModule } from './branch-sales-history/branch-sales-history.module';

@Module({
  imports: [BranchSalesHistoryModule],
  controllers: [SettingsController],
  providers: [SettingsService, PrismaService, RequireAdminGuard],
  exports: [SettingsService],
})
export class SettingsModule {}
