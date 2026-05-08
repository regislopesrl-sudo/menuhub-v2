import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  controllers: [OnboardingController],
  providers: [OnboardingService, PrismaService, RequireAdminGuard],
})
export class OnboardingModule {}

