import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  controllers: [StockController],
  providers: [StockService, PrismaService],
  exports: [StockService],
})
export class StockModule {}
