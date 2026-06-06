import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { InMemoryJobQueueService } from '../jobs/in-memory-job-queue.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { allowHeaderContextFallback, isProductionLike } from '../common/runtime-env';
import { sanitizeForLog } from '../common/safe-log';

@Injectable()
export class LocalDiagnosticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: InMemoryJobQueueService,
    private readonly integrations: IntegrationsService,
  ) {}

  async getDiagnostics() {
    const [companyCount, branchCount, orderCount, stockItemCount, pendingOutboxCount, auditCount] =
      await Promise.all([
        this.prisma.company.count().catch(() => null),
        this.prisma.branch.count().catch(() => null),
        this.prisma.order.count().catch(() => null),
        this.prisma.stockItem.count().catch(() => null),
        this.prisma.realtimeOutboxEvent.count({ where: { status: 'PENDING' } }).catch(() => null),
        this.prisma.auditLog.count().catch(() => null),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      service: 'api-v2',
      environment: this.getEnvironmentSnapshot(),
      database: {
        configured: Boolean(process.env.DATABASE_URL),
        counters: {
          companies: companyCount,
          branches: branchCount,
          orders: orderCount,
          stockItems: stockItemCount,
          pendingRealtimeOutboxEvents: pendingOutboxCount,
          auditLogs: auditCount,
        },
      },
      jobs: {
        provider: 'in-memory-local',
        stats: this.jobs.stats(),
        latest: this.jobs.list().slice(0, 20),
      },
      integrations: this.integrations.listCapabilities(),
      safety: {
        productionLike: isProductionLike(),
        realExternalProvidersEnabled: false,
        secretsPrinted: false,
      },
    };
  }

  private getEnvironmentSnapshot() {
    return sanitizeForLog({
      NODE_ENV: process.env.NODE_ENV ?? null,
      APP_ENV: process.env.APP_ENV ?? null,
      PORT: process.env.PORT ?? null,
      ALLOW_HEADER_CONTEXT_FALLBACK: allowHeaderContextFallback(),
      LOCAL_RATE_LIMIT_ENABLED: process.env.LOCAL_RATE_LIMIT_ENABLED ?? 'auto-local',
      LOCAL_RATE_LIMIT_MAX: process.env.LOCAL_RATE_LIMIT_MAX ?? '600',
    });
  }
}
