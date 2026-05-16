import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { PrismaService } from '../database/prisma.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [FinanceModule],
  controllers: [ReportsController],
  providers: [ReportsService, PrismaService],
})
export class ReportsModule {}
