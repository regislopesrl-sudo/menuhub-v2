import { Module } from '@nestjs/common';
import { DeveloperController } from './developer.controller';
import { ModulesModule } from '../modules/modules.module';
import { AuthModuleV2 } from '../auth/auth.module';

@Module({
  imports: [ModulesModule, AuthModuleV2],
  controllers: [DeveloperController],
})
export class DeveloperModule {}
