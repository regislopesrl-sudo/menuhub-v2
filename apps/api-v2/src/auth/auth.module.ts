import { Module } from '@nestjs/common';
import { AuthControllerV2 } from './auth.controller';
import { AuthServiceV2 } from './auth.service';
import { JwtServiceV2 } from './jwt.service';
import { PrismaService } from '../database/prisma.service';

@Module({
  controllers: [AuthControllerV2],
  providers: [AuthServiceV2, JwtServiceV2, PrismaService],
  exports: [JwtServiceV2, AuthServiceV2],
})
export class AuthModuleV2 {}
