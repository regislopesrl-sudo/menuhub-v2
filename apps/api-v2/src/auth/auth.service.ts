import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { JwtServiceV2 } from './jwt.service';
import type { AppUserRole, AuthTokenClaims, AuthTokens } from './auth.types';
import type { RequestContext } from '../common/request-context';

@Injectable()
export class AuthServiceV2 {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtServiceV2,
  ) {}

  async login(input: { email: string; password: string; branchId?: string }): Promise<AuthTokens> {
    const email = String(input.email ?? '').trim().toLowerCase();
    const password = String(input.password ?? '');
    if (!email || !password) {
      throw new BadRequestException('email e password sao obrigatorios.');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        email,
        isActive: true,
        deletedAt: null,
      },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        memberships: {
          where: { isActive: true },
        },
        branchAccesses: {
          include: {
            branch: true,
          },
        },
      },
    });

    if (!user || !this.verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    const roleKeys = user.roles.map((item) => item.role.name.trim().toLowerCase().replace(/[\s-]+/g, '_'));
    const isDeveloper = roleKeys.includes('developer');
    const isTechnicalAdmin = roleKeys.includes('technical_admin');
    let companyId: string;
    let branchScope: string[];
    let branchId: string | undefined;
    let role: AppUserRole;

    if (isDeveloper || isTechnicalAdmin) {
      role = isTechnicalAdmin ? 'technical_admin' : 'developer';
      const firstMembership = user.memberships[0];
      companyId = firstMembership?.companyId ?? user.branchAccesses[0]?.branch.companyId ?? '';
      if (!companyId) {
        companyId = String(process.env.DEFAULT_COMPANY_ID ?? '').trim();
      }
      if (!companyId) {
        throw new UnauthorizedException('Usuario tecnico sem escopo de empresa inicial.');
      }
      branchScope = user.branchAccesses
        .filter((access) => access.branch.companyId === companyId)
        .map((access) => access.branchId);
      branchId = input.branchId ?? branchScope[0];
    } else {
      const membership = this.resolveMembership(user.memberships, user.branchAccesses, input.branchId);
      companyId = membership.companyId;
      role = this.normalizeRoleKey(membership.roleKey);
      branchScope = user.branchAccesses
        .filter((access) => access.branch.companyId === companyId)
        .map((access) => access.branchId);
      branchId = this.resolveBranchIdForCompany(user.branchAccesses, companyId, input.branchId);
    }

    const permissions = this.buildPermissions(role);
    const sessionId = randomUUID();

    const accessClaims: AuthTokenClaims = {
      sub: user.id,
      companyId,
      branchId,
      branchScope,
      role,
      permissions,
      sessionId,
      type: 'access',
    };
    const refreshClaims: AuthTokenClaims = {
      ...accessClaims,
      type: 'refresh',
    };

    const accessToken = this.jwtService.signAccessToken(accessClaims);
    const refreshToken = this.jwtService.signRefreshToken(refreshClaims);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlSec() * 1000),
        deviceFingerprint: sessionId,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresInSec: this.accessTtlSec(),
    };
  }

  async loginWithDeveloperCode(input: { code: string }): Promise<AuthTokens> {
    const provided = String(input.code ?? '').trim();
    const expected = String(process.env.DEVELOPER_ACCESS_CODE ?? '').trim();
    if (!provided || !expected || provided !== expected) {
      throw new UnauthorizedException('Codigo tecnico invalido.');
    }

    const companyId = String(process.env.DEFAULT_COMPANY_ID ?? 'company-demo').trim() || 'company-demo';
    const branchIdRaw = String(process.env.DEFAULT_BRANCH_ID ?? '').trim();
    const branchId = branchIdRaw || undefined;
    const sessionId = randomUUID();

    const accessClaims: AuthTokenClaims = {
      sub: `developer:technical:${sessionId}`,
      companyId,
      branchId,
      branchScope: branchId ? [branchId] : [],
      role: 'developer',
      permissions: ['*'],
      sessionId,
      type: 'access',
    };

    const refreshClaims: AuthTokenClaims = {
      ...accessClaims,
      type: 'refresh',
    };

    return {
      accessToken: this.jwtService.signAccessToken(accessClaims),
      refreshToken: this.jwtService.signRefreshToken(refreshClaims),
      expiresInSec: this.accessTtlSec(),
    };
  }

  async refresh(input: { refreshToken: string }): Promise<AuthTokens> {
    const refreshToken = String(input.refreshToken ?? '').trim();
    if (!refreshToken) {
      throw new BadRequestException('refreshToken obrigatorio.');
    }
    const claims = this.jwtService.verifyToken(refreshToken);
    if (claims.type !== 'refresh') {
      throw new UnauthorizedException('Tipo de token invalido para refresh.');
    }

    const tokenHash = this.hashToken(refreshToken);
    const saved = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
      },
    });
    if (!saved) {
      throw new UnauthorizedException('Refresh token revogado ou desconhecido.');
    }

    await this.prisma.refreshToken.update({
      where: { id: saved.id },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });

    const sessionId = randomUUID();
    const accessClaims: AuthTokenClaims = {
      ...claims,
      sessionId,
      type: 'access',
    };
    const refreshClaims: AuthTokenClaims = {
      ...claims,
      sessionId,
      type: 'refresh',
    };
    const nextAccessToken = this.jwtService.signAccessToken(accessClaims);
    const nextRefreshToken = this.jwtService.signRefreshToken(refreshClaims);

    await this.prisma.refreshToken.create({
      data: {
        userId: claims.sub,
        tokenHash: this.hashToken(nextRefreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlSec() * 1000),
        deviceFingerprint: sessionId,
      },
    });

    return {
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      expiresInSec: this.accessTtlSec(),
    };
  }

  async logout(input: { refreshToken: string }): Promise<{ success: true }> {
    const refreshToken = String(input.refreshToken ?? '').trim();
    if (!refreshToken) {
      return { success: true };
    }
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.hashToken(refreshToken),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
    return { success: true };
  }

  async me(userId: string, ctx: RequestContext) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        lastLoginAt: true,
      },
    });
    if (!user) {
      if (ctx.userRole === 'developer' && userId.startsWith('developer:technical:')) {
        return {
          id: userId,
          name: 'Developer Tecnico',
          email: null,
          isActive: true,
          lastLoginAt: null,
          companyId: ctx.companyId,
          branchId: ctx.branchId ?? null,
          role: ctx.userRole,
          permissions: ctx.permissions ?? ['*'],
          sessionId: ctx.sessionId ?? null,
          technicalAccess: true,
        };
      }
      throw new UnauthorizedException('Sessao invalida.');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      companyId: ctx.companyId,
      branchId: ctx.branchId ?? null,
      role: ctx.userRole,
      permissions: ctx.permissions ?? [],
      sessionId: ctx.sessionId ?? null,
    };
  }

  private verifyPassword(plain: string, stored: string): boolean {
    if (!stored) return false;
    if (plain === stored) return true;
    if (stored.startsWith('scrypt:')) {
      const [, salt, hash] = stored.split(':');
      if (!salt || !hash) return false;
      const derived = scryptSync(plain, salt, 64).toString('hex');
      const a = Buffer.from(derived, 'hex');
      const b = Buffer.from(hash, 'hex');
      return a.length === b.length && timingSafeEqual(a, b);
    }
    return this.hashToken(plain) === stored;
  }

  private resolveMembership(
    memberships: Array<{ companyId: string; roleKey: string; isActive: boolean }>,
    accesses: Array<{ branchId: string; branch: { companyId: string } }>,
    requestedBranchId?: string,
  ) {
    if (memberships.length === 0) {
      throw new UnauthorizedException('Usuario sem membership ativo de empresa.');
    }

    if (requestedBranchId) {
      const byBranchCompany = accesses.find((item) => item.branchId === requestedBranchId)?.branch.companyId;
      if (byBranchCompany) {
        const found = memberships.find((item) => item.companyId === byBranchCompany);
        if (found) return found;
      }
    }

    return memberships[0];
  }

  private resolveBranchIdForCompany(
    accesses: Array<{ branchId: string; isDefault: boolean; branch: { companyId: string } }>,
    companyId: string,
    requestedBranchId?: string,
  ): string | undefined {
    const scoped = accesses.filter((item) => item.branch.companyId === companyId);
    if (scoped.length === 0) {
      return undefined;
    }
    if (requestedBranchId) {
      const found = scoped.find((item) => item.branchId === requestedBranchId);
      if (!found) {
        throw new UnauthorizedException('Usuario sem acesso a filial informada.');
      }
      return found.branchId;
    }
    return scoped.find((item) => item.isDefault)?.branchId ?? scoped[0]?.branchId;
  }

  private normalizeRoleKey(roleKey: string): AppUserRole {
    const key = String(roleKey ?? '').trim().toLowerCase();
    if (
      key === 'technical_admin' ||
      key === 'owner' ||
      key === 'manager' ||
      key === 'cashier' ||
      key === 'kitchen' ||
      key === 'waiter' ||
      key === 'delivery_operator'
    ) {
      return key;
    }
    if (key === 'admin' || key === 'master') return key;
    return 'user';
  }

  private buildPermissions(role: AppUserRole): string[] {
    const matrix: Record<string, string[]> = {
      developer: ['*'],
      technical_admin: ['*'],
      owner: ['admin.users.read', 'admin.users.write', 'settings.read', 'settings.write', 'orders.manage', 'modules.read'],
      manager: ['admin.users.read', 'settings.read', 'orders.manage', 'modules.read'],
      cashier: ['orders.manage', 'pdv.operate'],
      kitchen: ['kds.operate'],
      waiter: ['orders.read', 'waiter.operate'],
      delivery_operator: ['delivery.operate', 'orders.read'],
      admin: ['admin.users.read', 'settings.read', 'orders.manage'],
      master: ['admin.users.read', 'settings.read', 'orders.manage'],
      user: ['orders.read'],
    };
    return matrix[role] ?? ['orders.read'];
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private accessTtlSec(): number {
    return Number(process.env.AUTH_ACCESS_TTL_SEC ?? 900);
  }

  private refreshTtlSec(): number {
    return Number(process.env.AUTH_REFRESH_TTL_SEC ?? 60 * 60 * 24 * 15);
  }
}
