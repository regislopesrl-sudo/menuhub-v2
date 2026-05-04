import { Module } from '@nestjs/common';
import { DeveloperController } from './developer.controller';
import { PrismaService } from '../database/prisma.service';

@Module({
  controllers: [DeveloperController],
  providers: [PrismaService],
})
export class DeveloperModule {}
