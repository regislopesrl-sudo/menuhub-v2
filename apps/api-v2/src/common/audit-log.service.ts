import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  buildAuditActorFromContext,
  buildAuditScopeFromContext,
  createAuditEvent,
  type AuditAction,
  type AuditOutcome,
  type AuditSeverity,
  type AuditTarget,
} from './audit-log';
import type { RequestContext } from './request-context';

export interface AuditLogRecordInput {
  action: AuditAction;
  outcome: AuditOutcome;
  severity?: AuditSeverity;
  ctx?: RequestContext;
  target?: AuditTarget;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditLogRecordResult {
  recorded: boolean;
  id?: string;
  error?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditLogRecordInput): Promise<AuditLogRecordResult> {
    const event = createAuditEvent({
      action: input.action,
      outcome: input.outcome,
      severity: input.severity,
      actor: buildAuditActorFromContext(input.ctx),
      scope: buildAuditScopeFromContext(input.ctx),
      target: input.target,
      metadata: input.metadata,
    });

    try {
      const row = await this.prisma.auditLog.create({
        data: {
          companyId: event.scope?.companyId ?? null,
          branchId: event.scope?.branchId ?? null,
          actorUserId: event.actor.userId ?? null,
          actorType: event.actor.type,
          action: event.action,
          outcome: event.outcome,
          severity: event.severity,
          targetType: event.target?.type ?? null,
          targetId: event.target?.id ?? null,
          metadata: event.metadata as any,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          createdAt: event.occurredAt,
        },
      });
      return { recorded: true, id: row.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Falha ao gravar audit log: ${message}`);
      return { recorded: false, error: message };
    }
  }

  recordFromContext(input: AuditLogRecordInput): Promise<AuditLogRecordResult> {
    return this.record(input);
  }
}
