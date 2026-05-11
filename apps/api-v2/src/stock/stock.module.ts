import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ModulesModule } from '../modules/modules.module';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [ModulesModule],
  controllers: [StockController],
  providers: [StockService, PrismaService],
  exports: [StockService],
})
export class StockModule {}
