import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { RequireAdminGuard } from '../common/require-admin.guard';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, PrismaService, RequireAdminGuard],
})
export class SettingsModule {}
