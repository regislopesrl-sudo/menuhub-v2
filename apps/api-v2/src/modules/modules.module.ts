import { Module } from '@nestjs/common';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';
import { ModuleGuard } from './module.guard';
import { PrismaService } from '../database/prisma.service';
import { RuntimeFacadeService } from './runtime-facade.service';

@Module({
  controllers: [ModulesController],
  providers: [ModulesService, ModuleGuard, PrismaService, RuntimeFacadeService],
  exports: [ModulesService, ModuleGuard, RuntimeFacadeService],
})
export class ModulesModule {}

