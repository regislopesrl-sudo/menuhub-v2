import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CompanyRbacRepository {
  constructor(private readonly prisma: PrismaService) {}

  async syncPermissionCatalogFromGlobalPermissions() {
    const globalPermissions = await this.prisma.permission.findMany({
      select: {
        code: true,
        description: true,
      },
    });

    if (globalPermissions.length === 0) {
      return;
    }

    const existing = await this.prisma.companyPermission.findMany({
      select: {
        key: true,
      },
    });
    const existingKeys = new Set(existing.map((item) => item.key));
    const missing = globalPermissions.filter((permission) => !existingKeys.has(permission.code));
    if (missing.length === 0) {
      return;
    }

    await this.prisma.companyPermission.createMany({
      data: missing.map((permission) => ({
        id: randomUUID(),
        key: permission.code,
        description: permission.description ?? null,
      })),
    });
  }

  listGlobalRoles() {
    return this.prisma.role.findMany({
      orderBy: [{ name: 'asc' }],
      include: {
        permissions: {
          include: {
            permission: true,
          },
          orderBy: {
            permission: {
              code: 'asc',
            },
          },
        },
      },
    });
  }

  listCompanyRoles(companyId: string) {
    return this.prisma.companyRole.findMany({
      where: { companyId },
      orderBy: [{ name: 'asc' }],
      include: {
        permissions: {
          include: {
            permission: true,
          },
          orderBy: {
            permission: {
              key: 'asc',
            },
          },
        },
      },
    });
  }

  listCompanyPermissions() {
    return this.prisma.companyPermission.findMany({
      orderBy: [{ key: 'asc' }],
    });
  }

  findCompanyRoleById(companyId: string, roleId: string) {
    return this.prisma.companyRole.findFirst({
      where: {
        id: roleId,
        companyId,
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  findCompanyRolesByIds(companyId: string, roleIds: string[]) {
    return this.prisma.companyRole.findMany({
      where: {
        companyId,
        id: {
          in: roleIds,
        },
      },
      select: {
        id: true,
        companyId: true,
        key: true,
        name: true,
        description: true,
        isSystem: true,
      },
    });
  }

  findGlobalRolesByIds(roleIds: string[]) {
    return this.prisma.role.findMany({
      where: {
        id: {
          in: roleIds,
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
      },
    });
  }

  findCompanyPermissionsByIds(permissionIds: string[]) {
    return this.prisma.companyPermission.findMany({
      where: {
        id: {
          in: permissionIds,
        },
      },
      select: {
        id: true,
        key: true,
        description: true,
      },
    });
  }

  createCompanyRole(input: {
    companyId: string;
    key: string;
    name: string;
    description?: string | null;
    permissionIds: string[];
    createdBy?: string | null;
  }) {
    return this.prisma.companyRole.create({
      data: {
        companyId: input.companyId,
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        isSystem: false,
        createdBy: input.createdBy ?? null,
        updatedBy: input.createdBy ?? null,
        permissions: input.permissionIds.length
          ? {
              createMany: {
                data: input.permissionIds.map((permissionId) => ({
                  permissionId,
                })),
              },
            }
          : undefined,
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  async updateCompanyRole(input: {
    companyId: string;
    roleId: string;
    name?: string;
    description?: string | null;
    permissionIds?: string[];
    updatedBy?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      if (input.permissionIds) {
        await tx.companyRolePermission.deleteMany({
          where: { roleId: input.roleId },
        });
        if (input.permissionIds.length > 0) {
          await tx.companyRolePermission.createMany({
            data: input.permissionIds.map((permissionId) => ({
              roleId: input.roleId,
              permissionId,
            })),
          });
        }
      }

      return tx.companyRole.update({
        where: { id: input.roleId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.updatedBy !== undefined ? { updatedBy: input.updatedBy } : {}),
        },
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      });
    });
  }

  deleteCompanyRole(roleId: string) {
    return this.prisma.companyRole.delete({
      where: { id: roleId },
    });
  }

  replaceUserRoles(input: {
    userId: string;
    companyId: string;
    globalRoleIds: string[];
    companyRoleIds: string[];
    createdBy?: string | null;
  }) {
    return this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: input.userId } }),
      this.prisma.companyUserRole.deleteMany({
        where: {
          userId: input.userId,
          companyId: input.companyId,
        },
      }),
      ...(input.globalRoleIds.length
        ? [
            this.prisma.userRole.createMany({
              data: input.globalRoleIds.map((roleId) => ({
                userId: input.userId,
                roleId,
              })),
            }),
          ]
        : []),
      ...(input.companyRoleIds.length
        ? [
            this.prisma.companyUserRole.createMany({
              data: input.companyRoleIds.map((roleId) => ({
                companyId: input.companyId,
                userId: input.userId,
                roleId,
                createdBy: input.createdBy ?? null,
              })),
            }),
          ]
        : []),
    ]);
  }

  removeCompanyUserRole(input: { companyId: string; userId: string; roleId: string }) {
    return this.prisma.companyUserRole.delete({
      where: {
        companyId_userId_roleId: {
          companyId: input.companyId,
          userId: input.userId,
          roleId: input.roleId,
        },
      },
    });
  }

  getUserEffectiveAccess(input: { companyId: string; userId: string }) {
    return this.prisma.user.findFirst({
      where: {
        id: input.userId,
        deletedAt: null,
      },
      select: {
        id: true,
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
        companyUserRoles: {
          where: {
            companyId: input.companyId,
          },
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
      },
    });
  }
}
