import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';

@Module({
  controllers: [LogisticsController],
  providers: [LogisticsService, PrismaService],
  exports: [LogisticsService],
})
export class LogisticsModule {}
