import { Module } from '@nestjs/common';
import { ModulesModule } from '../modules/modules.module';
import { PrismaService } from '../database/prisma.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [ModulesModule],
  controllers: [FinanceController],
  providers: [FinanceService, PrismaService],
})
export class FinanceModule {}
