import { Logger } from '@nestjs/common';
import { recordAuditFromContext } from './audit-log-recorder';
import { AUDIT_ACTIONS } from './audit-log';

describe('audit-log-recorder', () => {
  it('emite evento sanitizado com actor/scope', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    recordAuditFromContext({
      action: AUDIT_ACTIONS.BILLING_MOCK_PAYMENT,
      outcome: 'failure',
      ctx: {
        companyId: 'c1',
        branchId: 'b1',
        requestId: 'r1',
        userRole: 'developer',
        source: 'technical-admin',
        permissions: ['*'],
      },
      target: { type: 'invoice', id: 'inv_1' },
      metadata: {
        token: 'secret-token',
        payload: { raw: 'sensitive' },
        status: 'FAILED',
      },
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = String(logSpy.mock.calls[0][0]);
    const event = JSON.parse(payload) as Record<string, unknown>;

    expect(event.action).toBe('platform.billing.mock_payment');
    expect(event.outcome).toBe('failure');
    expect(event.actor).toMatchObject({
      type: 'technical-admin',
      source: 'technical-admin',
    });
    expect(event.scope).toMatchObject({
      companyId: 'c1',
      branchId: 'b1',
      requestId: 'r1',
    });
    expect(event.metadata).toMatchObject({
      token: '[REDACTED]',
      payload: '[REDACTED]',
      status: 'FAILED',
    });

    logSpy.mockRestore();
  });
});

