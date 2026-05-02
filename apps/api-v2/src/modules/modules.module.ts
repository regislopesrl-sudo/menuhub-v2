import { Module } from '@nestjs/common';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';
import { ModuleGuard } from './module.guard';

@Module({
  controllers: [ModulesController],
  providers: [ModulesService, ModuleGuard],
  exports: [ModulesService, ModuleGuard],
})
export class ModulesModule {}

