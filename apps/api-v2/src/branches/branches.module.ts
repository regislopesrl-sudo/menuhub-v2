import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

@Module({
  controllers: [BranchesController],
  providers: [BranchesService, PrismaService, RequireAdminGuard],
})
export class BranchesModule {}
