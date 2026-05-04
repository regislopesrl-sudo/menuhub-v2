import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { compare } from 'bcryptjs';
import { signTechnicalToken } from '../common/technical-auth';

@Controller('v2/auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('login')
  async login(@Body() body: { email?: string; password?: string }) {
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? '';
    if (!email || !password) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    const user = await this.prisma.user.findFirst({
      where: { email, isActive: true },
      include: { roles: { include: { role: true } } },
    });
    if (!user) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    const isValidPassword = await compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    const hasTechnicalRole = user.roles.some((item) => item.role.name === 'TECHNICAL_ADMIN');
    if (!hasTechnicalRole) {
      throw new UnauthorizedException('Usuario sem permissao tecnica.');
    }

    const accessToken = signTechnicalToken({
      sub: user.id,
      email: user.email ?? '',
      role: 'TECHNICAL_ADMIN',
    });
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    return {
      accessToken,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: 'TECHNICAL_ADMIN' as const,
        roleLabel: 'Nível Técnico',
      },
    };
  }
}
