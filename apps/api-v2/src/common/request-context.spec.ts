import { BadRequestException } from '@nestjs/common';
import { buildRequestContextFromHeaders } from './request-context';

describe('buildRequestContextFromHeaders', () => {
  it('sem companyId retorna erro claro', () => {
    expect(() =>
      buildRequestContextFromHeaders({
        'x-user-role': 'admin',
      }),
    ).toThrow(new BadRequestException('Header x-company-id e obrigatorio na V2 (fallback local).'));
  });

  it('userRole invalido vira user', () => {
    const ctx = buildRequestContextFromHeaders({
      'x-company-id': 'company_a',
      'x-user-role': 'gestor',
    });

    expect(ctx.userRole).toBe('user');
  });

  it('requestId e gerado quando ausente', () => {
    const ctx = buildRequestContextFromHeaders({
      'x-company-id': 'company_a',
      'x-user-role': 'admin',
    });

    expect(typeof ctx.requestId).toBe('string');
    expect(ctx.requestId.length).toBeGreaterThan(0);
  });

  it('captura branchId quando informado', () => {
    const ctx = buildRequestContextFromHeaders({
      'x-company-id': 'company_a',
      'x-branch-id': 'branch_a',
    });

    expect(ctx.branchId).toBe('branch_a');
  });

  it('nunca eleva developer via header fallback', () => {
    const ctx = buildRequestContextFromHeaders({
      'x-company-id': 'company_a',
      'x-user-role': 'developer',
    });
    expect(ctx.userRole).toBe('user');
    expect(ctx.permissions).toEqual([]);
  });

  it('nunca eleva technical_admin via header fallback', () => {
    const ctx = buildRequestContextFromHeaders({
      'x-company-id': 'company_a',
      'x-user-role': 'technical_admin',
    });
    expect(ctx.userRole).toBe('user');
    expect(ctx.permissions).toEqual([]);
  });
});
