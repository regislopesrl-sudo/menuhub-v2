import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './common/public.decorator';
import { PrismaService } from './database/prisma.service';
import { InMemoryJobQueueService } from './jobs/in-memory-job-queue.service';

@Controller('v2')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: InMemoryJobQueueService,
  ) {}

  @Public()
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'api-v2',
      env: process.env.NODE_ENV ?? 'development',
    };
  }

  @Public()
  @Get('health/db')
  async getDatabaseHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        service: 'api-v2',
        database: 'reachable',
        checkedAt: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'down',
        service: 'api-v2',
        database: 'unreachable',
        checkedAt: new Date().toISOString(),
      });
    }
  }

  @Public()
  @Get('health/readiness')
  async getReadiness() {
    const checks = {
      api: 'ok',
      db: 'unknown',
      jobs: this.jobs.stats(),
      externalProviders: 'mock-only',
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = 'ok';
    } catch {
      checks.db = 'down';
    }

    const ready = checks.db === 'ok';
    const body = {
      status: ready ? 'ready' : 'not_ready',
      service: 'api-v2',
      env: process.env.NODE_ENV ?? 'development',
      appEnv: process.env.APP_ENV ?? null,
      checkedAt: new Date().toISOString(),
      checks,
    };

    if (!ready) {
      throw new ServiceUnavailableException(body);
    }

    return body;
  }
}
