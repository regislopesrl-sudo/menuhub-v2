import { UnauthorizedException } from '@nestjs/common';
import { AuthServiceV2 } from './auth.service';

describe('AuthServiceV2', () => {
  const jwtMock = {
    signAccessToken: jest.fn(() => 'access.token'),
    signRefreshToken: jest.fn(() => 'refresh.token'),
    verifyToken: jest.fn(),
  };

  const baseUser = {
    id: 'user_1',
    passwordHash: '123456',
    roles: [
      {
        role: {
          name: 'developer',
          permissions: [{ permission: { code: 'modules.write' } }],
        },
      },
    ],
    branchAccesses: [
      {
        branchId: 'branch_a',
        isDefault: true,
        branch: { companyId: 'company_a' },
      },
    ],
    memberships: [{ companyId: 'company_a', roleKey: 'owner', isActive: true }],
  };

  it('login valido retorna tokens', async () => {
    const prismaMock = {
      user: { findFirst: jest.fn().mockResolvedValue(baseUser) },
      refreshToken: { create: jest.fn() },
    } as any;
    const service = new AuthServiceV2(prismaMock, jwtMock as any);

    const result = await service.login({ email: 'dev@local.test', password: '123456' });

    expect(result.accessToken).toBe('access.token');
    expect(result.refreshToken).toBe('refresh.token');
    expect(result.expiresInSec).toBeGreaterThan(0);
  });

  it('login invalido bloqueia', async () => {
    const prismaMock = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      refreshToken: { create: jest.fn() },
    } as any;
    const service = new AuthServiceV2(prismaMock, jwtMock as any);

    await expect(service.login({ email: 'x@y.com', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
  });

  it('usuario empresa A nao acessa filial de empresa B', async () => {
    const prismaMock = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          ...baseUser,
          roles: [
            {
              role: { name: 'owner', permissions: [] },
            },
          ],
          memberships: [{ companyId: 'company_a', roleKey: 'owner', isActive: true }],
          branchAccesses: [
            { branchId: 'branch_a', isDefault: true, branch: { companyId: 'company_a' } },
          ],
        }),
      },
      refreshToken: { create: jest.fn() },
    } as any;
    const service = new AuthServiceV2(prismaMock, jwtMock as any);

    await expect(
      service.login({ email: 'owner@a.com', password: '123456', branchId: 'branch_b' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('developer-login com codigo correto funciona', async () => {
    process.env.DEVELOPER_ACCESS_CODE = 'dev-code-ok';
    process.env.DEFAULT_COMPANY_ID = 'company_demo';
    process.env.DEFAULT_BRANCH_ID = 'branch_demo';
    const prismaMock = {
      user: { findFirst: jest.fn() },
      refreshToken: { create: jest.fn() },
    } as any;
    const service = new AuthServiceV2(prismaMock, jwtMock as any);

    const result = await service.loginWithDeveloperCode({ code: 'dev-code-ok' });

    expect(result.accessToken).toBe('access.token');
    expect(result.refreshToken).toBe('refresh.token');
    expect(result.expiresInSec).toBeGreaterThan(0);
  });

  it('developer-login com codigo invalido bloqueia', async () => {
    process.env.DEVELOPER_ACCESS_CODE = 'dev-code-ok';
    const prismaMock = {
      user: { findFirst: jest.fn() },
      refreshToken: { create: jest.fn() },
    } as any;
    const service = new AuthServiceV2(prismaMock, jwtMock as any);

    await expect(service.loginWithDeveloperCode({ code: 'wrong' })).rejects.toThrow(UnauthorizedException);
  });
});
