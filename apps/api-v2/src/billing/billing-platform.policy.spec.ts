import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import {
  assertCanAccessCompanyBillingAction,
  assertCanPerformPlatformBillingAction,
  assertValidSubscriptionTransition,
  canPerformPlatformBillingAction,
  canTransitionSubscriptionStatus,
  getRequiredBillingPermissions,
} from './billing-platform.policy';

describe('billing-platform.policy', () => {
  it('mapeia permissao de billing:read para leitura de plataforma', () => {
    expect(getRequiredBillingPermissions('billing:read')).toEqual([
      'platform:billing:read',
      'platform:billing:manage',
    ]);
  });

  it('permite technical-admin source para billing manage', () => {
    expect(
      canPerformPlatformBillingAction(
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'technical-admin',
          requestId: 'r1',
          permissions: [],
        },
        'billing:manage',
      ),
    ).toBe(true);
  });

  it("permite '*' e platform:admin para todas as acoes de billing", () => {
    expect(
      canPerformPlatformBillingAction(
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['*'],
        },
        'billing:run_cycle',
      ),
    ).toBe(true);

    expect(
      canPerformPlatformBillingAction(
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:admin'],
        },
        'subscription:manage',
      ),
    ).toBe(true);
  });

  it('platform:billing:read permite leitura mas nao manage', () => {
    const ctx = {
      companyId: 'c1',
      userRole: 'developer' as const,
      source: 'jwt' as const,
      requestId: 'r1',
      permissions: ['platform:billing:read'],
    };

    expect(canPerformPlatformBillingAction(ctx, 'billing:read')).toBe(true);
    expect(canPerformPlatformBillingAction(ctx, 'billing:manage')).toBe(false);
  });

  it('platform:companies:read nao gerencia billing', () => {
    expect(
      canPerformPlatformBillingAction(
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:companies:read'],
        },
        'billing:manage',
      ),
    ).toBe(false);
  });

  it('tenant sem permissao platform pode atuar na propria company com billing tenant permission', () => {
    expect(() =>
      assertCanAccessCompanyBillingAction(
        {
          companyId: 'company_a',
          userRole: 'owner',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['billing.read'],
        },
        'company_a',
        'billing:read',
      ),
    ).not.toThrow();
  });

  it('tenant de outra company e bloqueado por scope', () => {
    expect(() =>
      assertCanAccessCompanyBillingAction(
        {
          companyId: 'company_a',
          userRole: 'owner',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['billing.manage'],
        },
        'company_b',
        'billing:manage',
      ),
    ).toThrow(ForbiddenException);
  });

  it('owner/admin/manager sem platform permission nao acessa acao platform billing', () => {
    for (const role of ['owner', 'admin', 'manager'] as const) {
      expect(
        canPerformPlatformBillingAction(
          {
            companyId: 'c1',
            userRole: role,
            source: 'jwt',
            requestId: 'r1',
            permissions: [],
          },
          'billing:read',
        ),
      ).toBe(false);
    }
  });

  it('contexto ausente bloqueia', () => {
    expect(canPerformPlatformBillingAction(undefined, 'billing:read')).toBe(false);
    expect(() => assertCanPerformPlatformBillingAction(undefined, 'billing:read')).toThrow(
      ForbiddenException,
    );
  });

  it('valida transicoes de assinatura permitidas e bloqueia invalidas', () => {
    expect(canTransitionSubscriptionStatus(SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE)).toBe(
      true,
    );
    expect(canTransitionSubscriptionStatus(SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE)).toBe(
      true,
    );
    expect(canTransitionSubscriptionStatus(SubscriptionStatus.PAST_DUE, SubscriptionStatus.ACTIVE)).toBe(
      true,
    );
    expect(canTransitionSubscriptionStatus(SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELED)).toBe(
      true,
    );
    expect(canTransitionSubscriptionStatus(SubscriptionStatus.CANCELED, SubscriptionStatus.ACTIVE)).toBe(
      true,
    );

    expect(canTransitionSubscriptionStatus(SubscriptionStatus.EXPIRED, SubscriptionStatus.TRIAL)).toBe(
      false,
    );
    expect(() =>
      assertValidSubscriptionTransition(SubscriptionStatus.EXPIRED, SubscriptionStatus.TRIAL),
    ).toThrow(BadRequestException);
  });
});
