import { Logger } from '@nestjs/common';
import type { RequestContext } from './request-context';
import {
  buildAuditActorFromContext,
  buildAuditScopeFromContext,
  createAuditEvent,
  type AuditAction,
  type AuditOutcome,
  type AuditTarget,
} from './audit-log';

const logger = new Logger('AuditLog');

export function recordAuditFromContext(input: {
  action: AuditAction;
  outcome: AuditOutcome;
  ctx?: RequestContext;
  target?: AuditTarget;
  metadata?: Record<string, unknown>;
}) {
  const event = createAuditEvent({
    action: input.action,
    outcome: input.outcome,
    actor: buildAuditActorFromContext(input.ctx),
    scope: buildAuditScopeFromContext(input.ctx),
    target: input.target,
    metadata: input.metadata,
  });

  logger.log(JSON.stringify(event));
}

