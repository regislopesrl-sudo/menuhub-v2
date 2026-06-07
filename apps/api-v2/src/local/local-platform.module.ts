import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { JobsModule } from '../jobs/jobs.module';
import { LocalDiagnosticsController } from './local-diagnostics.controller';
import { LocalDiagnosticsService } from './local-diagnostics.service';

@Module({
  imports: [JobsModule, IntegrationsModule],
  controllers: [LocalDiagnosticsController],
  providers: [LocalDiagnosticsService, PrismaService],
})
export class LocalPlatformModule {}
