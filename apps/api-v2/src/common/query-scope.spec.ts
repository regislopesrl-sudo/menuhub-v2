import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  assertAnyPermission,
  buildAllowedBranchesWhere,
  buildBranchWhere,
  buildCompanyWhere,
  canReadFinance,
  canReadInventoryCosts,
  requireCompanyId,
} from './query-scope';
import type { RequestContext } from './request-context';
import { TENANT_PERMISSIONS } from './rbac';

const baseCtx: RequestContext = {
  companyId: 'company-a',
  branchId: 'branch-a',
  allowedBranchIds: ['branch-a', 'branch-b'],
  userRole: 'owner',
  requestId: 'req-1',
  permissions: [TENANT_PERMISSIONS.INVENTORY_READ],
};

describe('query-scope', () => {
  it('exige companyId no contexto', () => {
    expect(() => requireCompanyId({ companyId: '' })).toThrow(
      new BadRequestException('companyId obrigatorio no contexto.'),
    );
  });

  it('monta filtro de empresa sem permitir sobrescrita de companyId', () => {
    expect(buildCompanyWhere(baseCtx, { companyId: 'outra', status: 'ACTIVE' })).toEqual({
      status: 'ACTIVE',
      companyId: 'company-a',
    });
  });

  it('monta filtro de filial validando escopo permitido', () => {
    expect(buildBranchWhere(baseCtx, { status: 'ACTIVE' }, 'branch-b')).toEqual({
      status: 'ACTIVE',
      companyId: 'company-a',
      branchId: 'branch-b',
    });
  });

  it('bloqueia filial fora do escopo permitido', () => {
    expect(() => buildBranchWhere(baseCtx, {}, 'branch-c')).toThrow(
      new ForbiddenException('Filial fora do escopo permitido.'),
    );
  });

  it('filtra todas as filiais permitidas em consultas de leitura', () => {
    expect(buildAllowedBranchesWhere(baseCtx, { status: 'POSTED' })).toEqual({
      status: 'POSTED',
      companyId: 'company-a',
      branchId: { in: ['branch-a', 'branch-b'] },
    });
  });

  it('valida permissoes explicitas para operacoes sensiveis', () => {
    expect(() =>
      assertAnyPermission(baseCtx, [TENANT_PERMISSIONS.INVENTORY_MANAGE]),
    ).toThrow(new ForbiddenException('Permissao insuficiente.'));
  });

  it('separa visibilidade de custo e financeiro', () => {
    expect(canReadInventoryCosts(baseCtx)).toBe(false);
    expect(canReadFinance(baseCtx)).toBe(false);

    const privilegedCtx = {
      ...baseCtx,
      permissions: [TENANT_PERMISSIONS.INVENTORY_COST_READ, TENANT_PERMISSIONS.FINANCE_READ],
    };
    expect(canReadInventoryCosts(privilegedCtx)).toBe(true);
    expect(canReadFinance(privilegedCtx)).toBe(true);
  });
});
