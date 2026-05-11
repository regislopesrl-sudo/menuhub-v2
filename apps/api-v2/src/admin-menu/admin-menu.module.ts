import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ModulesModule } from '../modules/modules.module';
import { AdminMenuController, AdminMenuUtilityController } from './admin-menu.controller';
import { AdminMenuService } from './admin-menu.service';
import { RequireAdminGuard } from '../common/require-admin.guard';

@Module({
  imports: [ModulesModule],
  controllers: [AdminMenuController, AdminMenuUtilityController],
  providers: [AdminMenuService, PrismaService, RequireAdminGuard],
})
export class AdminMenuModule {}
