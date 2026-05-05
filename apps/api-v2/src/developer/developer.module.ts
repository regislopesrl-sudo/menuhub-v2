import { Module } from '@nestjs/common';
import { DeveloperController } from './developer.controller';
import { ModulesModule } from '../modules/modules.module';
import { AuthModuleV2 } from '../auth/auth.module';
import { PrismaService } from '../database/prisma.service';

@Module({
  imports: [ModulesModule, AuthModuleV2],
  controllers: [DeveloperController],
  providers: [PrismaService],
})
export class DeveloperModule {}
