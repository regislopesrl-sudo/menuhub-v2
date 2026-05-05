import { Module } from '@nestjs/common';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';
import { ModuleGuard } from './module.guard';
import { RequireDeveloperGuard } from '../common/require-developer.guard';
import { PrismaService } from '../database/prisma.service';

@Module({
  controllers: [ModulesController],
  providers: [ModulesService, ModuleGuard, RequireDeveloperGuard, PrismaService],
  exports: [ModulesService, ModuleGuard],
})
export class ModulesModule {}
