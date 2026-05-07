import { ForbiddenException } from '@nestjs/common';
import {
  assertCanPerformPlatformAction,
  canPerformPlatformAction,
  getRequiredPlatformPermissions,
} from './developer-platform.policy';

describe('developer-platform.policy', () => {
  it('mapeia permissao esperada por acao', () => {
    expect(getRequiredPlatformPermissions('plans:manage')).toEqual([
      'platform:plans:manage',
    ]);
  });

  it('nega tenant sem permissao platform para a acao', () => {
    const allowed = canPerformPlatformAction(
      {
        companyId: 'c1',
        userRole: 'manager',
        requestId: 'r1',
        permissions: [],
      },
      'plans:manage',
    );
    expect(allowed).toBe(false);
  });

  it('permite technical-admin source em qualquer acao de plataforma', () => {
    const allowed = canPerformPlatformAction(
      {
        companyId: 'c1',
        userRole: 'developer',
        source: 'technical-admin',
        requestId: 'r1',
        permissions: [],
      },
      'companies:update',
    );
    expect(allowed).toBe(true);
  });

  it("permite '*' em qualquer acao de plataforma", () => {
    const allowed = canPerformPlatformAction(
      {
        companyId: 'c1',
        userRole: 'developer',
        requestId: 'r1',
        permissions: ['*'],
      },
      'billing:manage',
    );
    expect(allowed).toBe(true);
  });

  it("permite 'platform:admin' em qualquer acao de plataforma", () => {
    const allowed = canPerformPlatformAction(
      {
        companyId: 'c1',
        userRole: 'developer',
        requestId: 'r1',
        permissions: ['platform:admin'],
      },
      'plans:manage',
    );
    expect(allowed).toBe(true);
  });

  it("permite 'platform:companies:read' apenas em companies:read", () => {
    const readAllowed = canPerformPlatformAction(
      {
        companyId: 'c1',
        userRole: 'developer',
        requestId: 'r1',
        permissions: ['platform:companies:read'],
      },
      'companies:read',
    );
    expect(readAllowed).toBe(true);

    const updateAllowed = canPerformPlatformAction(
      {
        companyId: 'c1',
        userRole: 'developer',
        requestId: 'r1',
        permissions: ['platform:companies:read'],
      },
      'companies:update',
    );
    expect(updateAllowed).toBe(false);
  });

  it("bloqueia 'platform:billing:read' em billing:manage", () => {
    const allowed = canPerformPlatformAction(
      {
        companyId: 'c1',
        userRole: 'developer',
        requestId: 'r1',
        permissions: ['platform:billing:read'],
      },
      'billing:manage',
    );
    expect(allowed).toBe(false);
  });

  it('bloqueia tenant roles sem permissao platform', () => {
    for (const role of ['owner', 'admin', 'manager'] as const) {
      const allowed = canPerformPlatformAction(
        {
          companyId: 'c1',
          userRole: role,
          requestId: 'r1',
          permissions: [],
        },
        'companies:read',
      );
      expect(allowed).toBe(false);
    }
  });

  it('bloqueia contexto ausente', () => {
    expect(canPerformPlatformAction(undefined, 'companies:read')).toBe(false);
  });

  it('assert bloqueia quando contexto nao possui permissao da acao', () => {
    expect(() =>
      assertCanPerformPlatformAction(
        {
          companyId: 'c1',
          userRole: 'owner',
          source: 'jwt',
          requestId: 'r1',
          permissions: [],
        },
        'plans:manage',
      ),
    ).toThrow(ForbiddenException);
  });
});
