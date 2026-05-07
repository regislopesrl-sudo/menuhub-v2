import {
  AUDIT_ACTIONS,
  buildAuditActorFromContext,
  buildAuditScopeFromContext,
  createAuditEvent,
  getDefaultSeverityForAuditAction,
  sanitizeAuditMetadata,
} from './audit-log';

describe('audit-log contract and policy', () => {
  it('define severidade default por action', () => {
    expect(getDefaultSeverityForAuditAction(AUDIT_ACTIONS.SUBSCRIPTION_PATCH)).toBe('critical');
    expect(getDefaultSeverityForAuditAction(AUDIT_ACTIONS.ORDER_STATUS_UPDATE)).toBe('medium');
  });

  it('construtor de actor respeita technical-admin source', () => {
    const actor = buildAuditActorFromContext({
      userId: 'u1',
      source: 'technical-admin',
      userRole: 'developer',
      permissions: ['*'],
    });
    expect(actor).toEqual(
      expect.objectContaining({
        type: 'technical-admin',
        userId: 'u1',
        source: 'technical-admin',
      }),
    );
  });

  it('construtor de scope usa company/branch/request context', () => {
    const scope = buildAuditScopeFromContext({
      companyId: 'c1',
      branchId: 'b1',
      requestId: 'r1',
    });
    expect(scope).toEqual({ companyId: 'c1', branchId: 'b1', requestId: 'r1' });
  });

  it('mascara password/token/secret', () => {
    const metadata = sanitizeAuditMetadata({
      password: '123',
      token: 'abc',
      secret: 'xyz',
    });
    expect(metadata).toEqual({
      password: '[REDACTED]',
      token: '[REDACTED]',
      secret: '[REDACTED]',
    });
  });

  it('mascara accessToken/refreshToken', () => {
    const metadata = sanitizeAuditMetadata({
      accessToken: 'a',
      refreshToken: 'b',
      access_token: 'c',
      'refresh-token': 'd',
    });
    expect(metadata).toEqual({
      accessToken: '[REDACTED]',
      refreshToken: '[REDACTED]',
      access_token: '[REDACTED]',
      'refresh-token': '[REDACTED]',
    });
  });

  it('mascara authorization/cookie/jwt', () => {
    const metadata = sanitizeAuditMetadata({
      authorization: 'Bearer x',
      cookie: 'c=v',
      jwt: 'jwt',
      'set-cookie': 's=v',
      bearer: 'Bearer y',
    });
    expect(metadata).toEqual({
      authorization: '[REDACTED]',
      cookie: '[REDACTED]',
      jwt: '[REDACTED]',
      'set-cookie': '[REDACTED]',
      bearer: '[REDACTED]',
    });
  });

  it('mascara apiKey/api-key/x-api-key', () => {
    const metadata = sanitizeAuditMetadata({
      apiKey: 'a',
      'api-key': 'b',
      'x-api-key': 'c',
    });
    expect(metadata).toEqual({
      apiKey: '[REDACTED]',
      'api-key': '[REDACTED]',
      'x-api-key': '[REDACTED]',
    });
  });

  it('mascara card/cardNumber/cvv', () => {
    const metadata = sanitizeAuditMetadata({
      card: '4111',
      cardNumber: '4111111111111111',
      cvv: '123',
      card_number: '4111',
    });
    expect(metadata).toEqual({
      card: '[REDACTED]',
      cardNumber: '[REDACTED]',
      cvv: '[REDACTED]',
      card_number: '[REDACTED]',
    });
  });

  it('mascara pixKey', () => {
    const metadata = sanitizeAuditMetadata({
      pixKey: 'chave',
      pix_key: 'chave2',
    });
    expect(metadata).toEqual({
      pixKey: '[REDACTED]',
      pix_key: '[REDACTED]',
    });
  });

  it('mascara document/cpf/cnpj', () => {
    const metadata = sanitizeAuditMetadata({
      document: 'doc',
      cpf: '111',
      cnpj: '222',
    });
    expect(metadata).toEqual({
      document: '[REDACTED]',
      cpf: '[REDACTED]',
      cnpj: '[REDACTED]',
    });
  });

  it('mascara email/phone', () => {
    const metadata = sanitizeAuditMetadata({
      email: 'user@test.com',
      phone: '5511999999999',
      user_email: 'x',
      'user-phone': 'y',
    });
    expect(metadata).toEqual({
      email: '[REDACTED]',
      phone: '[REDACTED]',
      user_email: '[REDACTED]',
      'user-phone': '[REDACTED]',
    });
  });

  it('mascara payload/rawPayload/providerPayload/webhookPayload', () => {
    const metadata = sanitizeAuditMetadata({
      payload: { any: 'value' },
      rawPayload: { any: 'value' },
      providerPayload: { any: 'value' },
      webhookPayload: { any: 'value' },
      raw_payload: { any: 'value' },
      'provider-payload': { any: 'value' },
    });
    expect(metadata).toEqual({
      payload: '[REDACTED]',
      rawPayload: '[REDACTED]',
      providerPayload: '[REDACTED]',
      webhookPayload: '[REDACTED]',
      raw_payload: '[REDACTED]',
      'provider-payload': '[REDACTED]',
    });
  });

  it('mascara nested object', () => {
    const metadata = sanitizeAuditMetadata({
      nested: {
        accessToken: 'abc',
        child: { webhookSecret: 'x' },
      },
      plain: 'ok',
    });
    expect(metadata).toEqual({
      nested: {
        accessToken: '[REDACTED]',
        child: { webhookSecret: '[REDACTED]' },
      },
      plain: 'ok',
    });
  });

  it('mascara array com objetos', () => {
    const metadata = sanitizeAuditMetadata({
      items: [{ token: 'a' }, { nested: { apiKey: 'b' } }],
    });
    expect(metadata).toEqual({
      items: [{ token: '[REDACTED]' }, { nested: { apiKey: '[REDACTED]' } }],
    });
  });

  it('preserva campos seguros', () => {
    const metadata = sanitizeAuditMetadata({
      action: 'platform.company.create',
      moduleKey: 'delivery',
      companyId: 'c1',
      branchId: 'b1',
      invoiceId: 'i1',
      subscriptionId: 's1',
      status: 'ACTIVE',
    });
    expect(metadata).toEqual({
      action: 'platform.company.create',
      moduleKey: 'delivery',
      companyId: 'c1',
      branchId: 'b1',
      invoiceId: 'i1',
      subscriptionId: 's1',
      status: 'ACTIVE',
    });
  });

  it('metadata undefined nao quebra', () => {
    expect(sanitizeAuditMetadata(undefined)).toBeUndefined();
  });

  it('createAuditEvent aplica defaults e sanitizacao', () => {
    const event = createAuditEvent({
      action: AUDIT_ACTIONS.BILLING_ACCOUNT_UPSERT,
      outcome: 'success',
      actor: { type: 'user', userId: 'u1' },
      metadata: {
        token: 'sensitive',
        payload: { raw: 'secret' },
        status: 'ok',
      },
    });
    expect(event.severity).toBe('high');
    expect(event.metadata).toEqual({
      token: '[REDACTED]',
      payload: '[REDACTED]',
      status: 'ok',
    });
    expect(event.occurredAt).toBeInstanceOf(Date);
  });
});
