import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StockItemsController } from './stock-items.controller';
import { StockItemsService } from './stock-items.service';

@Module({
  controllers: [StockItemsController],
  providers: [StockItemsService, PrismaService],
})
export class StockItemsModule {}
